/* eslint-disable no-console */

import ciInfo from 'ci-info'
import execa from 'execa'
import k8testLog from 'k8test-log'
import _ from 'lodash'
import path from 'path'
import { getPackageInfo } from './package-info'
import { calculatePackagesHash } from './packages-hash'
import { promote } from './promote'
import { publish } from './publish'
import { Auth, Graph, PackageInfo } from './types'
import Redis from 'ioredis'
import fse from 'fs-extra'

export { TargetType, PackageJson } from './types'

const log = k8testLog('ci')

async function getPackages(rootPath: string): Promise<string[]> {
  const result = await execa.command('yarn workspaces --json info', {
    cwd: rootPath,
  })
  const workspacesInfo: { location: string }[] = JSON.parse(JSON.parse(result.stdout).data)
  return Object.values(workspacesInfo)
    .map(workspaceInfo => workspaceInfo.location)
    .map(relativePackagePath => path.join(rootPath, relativePackagePath))
}

async function getOrderedGraph({
  packagesPath,
  rootPath,
  dockerRegistryAddress,
  dockerRepositoryName,
  npmRegistryAddress,
  redisClient,
}: {
  rootPath: string
  packagesPath: string[]
  npmRegistryAddress: string
  dockerRegistryAddress: string
  dockerRepositoryName: string
  redisClient: Redis.Redis
}): Promise<Graph<PackageInfo>> {
  const orderedGraph = await calculatePackagesHash(rootPath, packagesPath)
  return Promise.all(
    orderedGraph.map(async node => ({
      ...node,
      data: await getPackageInfo({
        dockerRegistryAddress,
        dockerRepositoryName,
        npmRegistryAddress,
        packageHash: node.data.packageHash,
        packagePath: node.data.packagePath,
        relativePackagePath: node.data.relativePackagePath,
        redisClient,
      }),
    })),
  )
}

const isRepoModified = async (rootPath: string) => {
  return execa.command('git status --porcelain', { cwd: rootPath }).then(
    () => false,
    () => true,
  )
}

async function gitAmendChanges({
  auth,
  gitOrganizationName,
  gitRepositoryName,
  gitServerDomain,
  rootPath,
}: {
  rootPath: string
  gitServerConnectionType: string
  gitServerDomain: string
  gitRepositoryName: string
  gitOrganizationName: string
  auth: Auth
}) {
  if (await isRepoModified(rootPath)) {
    if (ciInfo.isCI) {
      await execa.command(
        // eslint-disable-next-line no-process-env
        `git remote set-url origin https://${auth.gitServerUsername}:${auth.gitServerToken}@${gitServerDomain}/${gitOrganizationName}/${gitRepositoryName}.git
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

export type CiOptions = {
  rootPath: string
  isMasterBuild: boolean
  isDryRun: boolean
  skipTests: boolean
  npmRegistryAddress: string
  dockerRegistryAddress: string
  dockerRepositoryName: string
  gitRepositoryName: string
  gitOrganizationName: string
  gitServerDomain: string
  gitServerConnectionType: string
  redisIp: string
  redisPort: number
  auth: Auth
}

export async function ci(options: CiOptions) {
  log('starting ci execution. options: %O', options)

  if (await isRepoModified(options.rootPath)) {
    // why: in the ci flow, we mutate and packageJsons and then git-commit-amend the changed, so I don't want to add external changed to the commit
    throw new Error(`can't run ci on modified git repository. please commit your changes and run the ci again.`)
  }

  // @ts-ignore
  if (!(await fse.exists(path.join(options.rootPath, 'yarn.lock')))) {
    throw new Error(`project must have yarn.lock file in the root folder of the repository`)
  }

  log('calculate hash of every package and check which packages changed since their last publish')

  if (options.auth.dockerRegistryUsername && options.auth.dockerRegistryToken) {
    log('logging in to docker-hub registry')
    // I need to login to read and push from `options.auth.dockerRegistryUsername` repository
    await execa.command(
      `docker login --username=${options.auth.dockerRegistryUsername} --password=${options.auth.dockerRegistryToken}`,
      { stdio: 'pipe' },
    )
    log('logged in to docker-hub registry')
  }

  const redisClient = new Redis({
    host: options.redisIp,
    port: options.redisPort,
    ...(options.auth.redisPassword && { password: options.auth.redisPassword }),
  })

  const packagesPath = await getPackages(options.rootPath)
  const orderedGraph = await getOrderedGraph({
    rootPath: options.rootPath,
    packagesPath,
    dockerRegistryAddress: options.dockerRegistryAddress,
    dockerRepositoryName: options.dockerRepositoryName,
    npmRegistryAddress: options.npmRegistryAddress,
    redisClient,
  })

  log('%d packages: %s', orderedGraph.length, orderedGraph.map(node => `"${node.data.packageJson.name}"`).join(', '))
  orderedGraph.forEach(node => {
    log(`%s (%s): %O`, node.data.relativePackagePath, node.data.packageJson.name, {
      ..._.omit(node.data, ['packageJson']),
      packageJsonVersion: node.data.packageJson.version,
    })
  })

  if (!options.skipTests) {
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
        dockerRegistryAddress: options.dockerRegistryAddress,
        dockerRepositoryName: options.dockerRepositoryName,
        npmRegistryAddress: options.npmRegistryAddress,
        auth: options.auth,
      })
      if (!options.isDryRun) {
        await gitAmendChanges({
          auth: options.auth,
          gitServerConnectionType: options.gitServerConnectionType,
          gitOrganizationName: options.gitOrganizationName,
          gitRepositoryName: options.gitRepositoryName,
          gitServerDomain: options.gitServerDomain,
          rootPath: options.rootPath,
        })
      }
    }
  }
  await redisClient.quit()
}