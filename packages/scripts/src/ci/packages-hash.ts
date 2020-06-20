import crypto from 'crypto'
import execa from 'execa'
import fs from 'fs-extra'
import path from 'path'
import _ from 'lodash'
import { PackageJson, Graph } from './types'
import k8testLog from 'k8test-log'

const log = k8testLog('scripts:ci')

const isInParent = (parent: string, child: string) => {
  const relative = path.relative(parent, child)
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
}

type FileInfo = {
  hash: string
  relativeFilePath: string
}

export type PackageHashInfo = {
  relativePackagePath: string
  packagePath: string
  packageHash: string
  packageJson: PackageJson
  children: string[]
  parents: PackageHashInfo[]
}

function fillParentsInGraph(packageHashInfoByPath: Map<string, PackageHashInfo>) {
  const visited = new Map<string, boolean>()
  function visit(packagePath: string) {
    if (!visited.has(packagePath)) {
      visited.set(packagePath, true)
      const parent = packageHashInfoByPath.get(packagePath) as PackageHashInfo
      parent.children.forEach(dependencyPath => {
        const child = packageHashInfoByPath.get(dependencyPath) as PackageHashInfo
        if (!child.parents.includes(parent)) {
          child.parents.push(parent)
        }
      })
      parent.children.forEach(visit)
    }
  }
  ;[...packageHashInfoByPath.keys()].forEach(visit)
}

function createOrderGraph(
  packageHashInfoByPath: Map<string, PackageHashInfo>,
): Graph<{ relativePackagePath: string; packagePath: string; packageHash: string; packageJson: PackageJson }> {
  const heads = [...packageHashInfoByPath.values()].filter(packageHashInfo => packageHashInfo.children.length === 0)
  const orderedGraph: PackageHashInfo[] = []
  const visited = new Map<PackageHashInfo, boolean>()
  function visit(node: PackageHashInfo) {
    if (!visited.has(node)) {
      visited.set(node, true)
      orderedGraph.push(node)
      node.parents.map(packagePath => packageHashInfoByPath.get(packagePath.packagePath)!).forEach(visit)
    }
  }
  heads.forEach(visit)
  return orderedGraph
    .map((node, index) => {
      // @ts-ignore
      node.index = index
      return node
    })
    .map(node => ({
      data: {
        relativePackagePath: node.relativePackagePath,
        packageHash: node.packageHash,
        packageJson: node.packageJson,
        packagePath: node.packagePath,
      },
      // @ts-ignore
      childrenIndexes: node.children.map(packagePath => packageHashInfoByPath.get(packagePath)?.index!),
      // @ts-ignore
      parentsIndexes: node.parents.map(parent => parent.index),
    }))
}

function calculateHashOfFiles(filesInfo: FileInfo[]): string {
  const hash = filesInfo.reduce((hasher, fileInfo) => {
    hasher.update(fileInfo.hash)
    return hasher
  }, crypto.createHash('sha224'))
  return Buffer.from(hash.digest()).toString('hex')
}

function combineHashes(hashes: string[]): string {
  const hash = hashes.reduce((hasher, hash, index) => {
    hasher.update(hash)
    return hasher
  }, crypto.createHash('sha224'))
  return Buffer.from(hash.digest()).toString('hex')
}

const isRootFile = (fileInfo: FileInfo) => !fileInfo.relativeFilePath.startsWith('packages')

const parseGitLs = (stdout: string): FileInfo[] =>
  stdout
    .split('\n')
    .map(line =>
      line
        .split(' ')
        .slice(2)
        .join('')
        .split('\t'),
    )
    .map(([hash, relativeFilePath]) => ({ hash, relativeFilePath }))

export async function calculatePackagesHash(
  rootPath: string,
  packagesPath: string[],
): Promise<Graph<{ relativePackagePath: string; packagePath: string; packageHash: string; packageJson: PackageJson }>> {
  const allFilesResult = await execa.command('git ls-tree -r head', {
    cwd: rootPath,
  })

  const allFilesInfo = parseGitLs(allFilesResult.stdout)

  const packagesWithPackageJson = await Promise.all(
    packagesPath.map<Promise<{ packagePath: string; packageJson: PackageJson }>>(async packagePath => ({
      packagePath,
      packageJson: await fs.readJson(path.join(packagePath, 'package.json')),
    })),
  )

  const getDepsPaths = (deps?: { [key: string]: string }): string[] =>
    Object.keys(deps || {})
      .map(dependencyName => packagesWithPackageJson.find(({ packageJson }) => packageJson.name === dependencyName))
      .filter(Boolean)
      .map(p => p?.packagePath as string)

  const packageHashInfoByPath: Map<string, PackageHashInfo> = new Map(
    packagesWithPackageJson.map(({ packagePath, packageJson }) => {
      const packageFiles = allFilesInfo.filter(fileInfo => isInParent(packagePath, fileInfo.relativeFilePath))
      const packageHash = packageFiles.reduce((hasher, fileInfo) => {
        hasher.update(fileInfo.hash)
        return hasher
      }, crypto.createHash('sha224'))

      return [
        packagePath,
        {
          relativePackagePath: path.relative(rootPath, packagePath),
          packagePath,
          packageJson,
          packageHash: Buffer.from(packageHash.digest()).toString('hex'),
          children: [...getDepsPaths(packageJson?.dependencies), ...getDepsPaths(packageJson?.devDependencies)],
          parents: [], // I will fill this soon
        },
      ]
    }),
  )

  fillParentsInGraph(packageHashInfoByPath)

  const orderedGraph = createOrderGraph(packageHashInfoByPath)

  const rootFilesInfo = allFilesInfo.filter(isRootFile)

  const rootFilesHash = calculateHashOfFiles(rootFilesInfo)

  const result = _.cloneDeep(orderedGraph).map((packageHashInfo, _index, array) => ({
    ...packageHashInfo,
    data: {
      ...packageHashInfo.data,
      packageHash: combineHashes([
        rootFilesHash,
        packageHashInfo.data.packageHash,
        ...packageHashInfo.childrenIndexes.map(i => array[i].data.packageHash),
      ]),
    },
  }))

  log('calculated hashes to every package in the monorepo:')
  log('root-files -> %s', rootFilesHash)
  result.forEach(node =>
    log(`%s (%s) -> %s`, node.data.relativePackagePath, node.data.packageJson.name, node.data.packageHash),
  )
  log('---------------------------------------------------')
  return result
}
