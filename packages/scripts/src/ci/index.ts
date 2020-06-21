/* eslint-disable no-console */

import { calculatePackagesHash } from './packages-hash'
import execa from 'execa'
import path from 'path'
import { getPackageInfo } from './package-info'
import { PackageInfo, Graph } from './types'
import { publish } from './publish'
import { promote } from './promote'
import k8testLog from 'k8test-log'
import _ from 'lodash'
import ciInfo from 'ci-info'
import process from 'process'

const log = k8testLog('scripts:ci')

async function getPackages(rootPath: string): Promise<string[]> {
  const result = await execa.command('yarn workspaces --json info', {
    cwd: rootPath,
  })
  const workspacesInfo: { location: string }[] = JSON.parse(JSON.parse(result.stdout).data)
  return Object.values(workspacesInfo)
    .map(workspaceInfo => workspaceInfo.location)
    .map(relativePackagePath => path.join(rootPath, relativePackagePath))
}

async function getOrderedGraph(rootPath: string, packagesPath: string[]): Promise<Graph<PackageInfo>> {
  const orderedGraph = await calculatePackagesHash(rootPath, packagesPath)
  return Promise.all(
    orderedGraph.map(async node => ({
      ...node,
      data: await getPackageInfo(node.data.relativePackagePath, node.data.packagePath, node.data.packageHash),
    })),
  )
}

const isRepoModified = (rootPath: string) =>
  execa.command('git diff-index --quiet HEAD --', { cwd: rootPath }).then(
    () => false,
    () => true,
  )

async function gitAmendChanges(rootPath: string) {
  if (await isRepoModified(rootPath)) {
    if (ciInfo.isCI) {
      await execa.command(
        // eslint-disable-next-line no-process-env
        `git remote set-url origin https://stavalfi:${process.env['GITHUB_TOKEN']}@github.com/stavalfi/k8test.git
      `,
        { cwd: rootPath },
      )
    }
    log('committing changes to git')
    await execa.command('git add --all', { cwd: rootPath })
    await execa.command(`git commit -m ci--promoted-packages-versions`, { cwd: rootPath })
    log('pushing commit to working-branch')
    await execa.command('git push', { cwd: rootPath })
    log('pushed commit to working-branch')
  }
}

export async function ci(options: { rootPath: string; isMasterBuild: boolean; isDryRun: boolean; runTests: boolean }) {
  log('starting ci execution. options: %O', options)

  if (await isRepoModified(options.rootPath)) {
    // why: in the ci flow, we mutate and packageJsons and then git-commit-amend the changed, so I don't want to add external changed to the commit
    throw new Error(`can't run ci on modified git repository. please commit your changes and run the ci again.`)
  }

  log('calculate hash of every package and check which packages changed since their last publish')

  const packagesPath = await getPackages(options.rootPath)
  const orderedGraph = await getOrderedGraph(options.rootPath, packagesPath)

  log('%d packages: %s', orderedGraph.length, orderedGraph.map(node => `"${node.data.packageJson.name}"`).join(', '))
  orderedGraph.forEach(node => {
    log(`%s (%s): %O`, node.data.relativePackagePath, node.data.packageJson.name, {
      ..._.omit(node.data, ['packageJson']),
      packageJsonVersion: node.data.packageJson.version,
    })
  })

  if (options.runTests) {
    await execa.command('yarn test', {
      cwd: options.rootPath,
      stdio: 'inherit',
    })
  }

  if (options.isMasterBuild) {
    const promoted = await promote(orderedGraph)
    if (promoted.length > 0) {
      // Note: we mutated some of the packageJSONs in the promote function so the hashes we calculated earlier are no longer valid
      const updatedHashes = await calculatePackagesHash(options.rootPath, packagesPath)
      const updatedOrderedGraph: Graph<PackageInfo> = updatedHashes.map((node, index) => ({
        ...node,
        data: {
          ...orderedGraph[index].data,
          packageHash: node.data.packageHash,
        },
      }))
      await publish(updatedOrderedGraph, {
        isDryRun: options.isDryRun,
        rootPath: options.rootPath,
      })
      await gitAmendChanges(options.rootPath)
    }
  }
}
