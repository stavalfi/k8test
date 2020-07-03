/* eslint-disable no-console */

import execa from 'execa'
import fse from 'fs-extra'
import Redis from 'ioredis'
import k8testLog from 'k8test-log'
import _ from 'lodash'
import path from 'path'
import { dockerRegistryLogin } from './docker-utils'
import { getPackageInfo } from './package-info'
import { calculatePackagesHash } from './packages-hash'
import { promote } from './promote'
import { publish } from './publish'
import { CiOptions, Graph, PackageInfo, ServerInfo } from './types'

export { buildFullDockerImageName, dockerRegistryLogin, getDockerImageLabelsAndTags } from './docker-utils'
export { npmRegistryLogin } from './npm-utils'
export { PackageJson, TargetType } from './types'

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
  dockerOrganizationName,
  redisClient,
  dockerRegistry,
  npmRegistry,
}: {
  rootPath: string
  packagesPath: string[]
  npmRegistry: ServerInfo
  dockerRegistry: ServerInfo
  dockerOrganizationName: string
  redisClient: Redis.Redis
}): Promise<Graph<PackageInfo>> {
  const orderedGraph = await calculatePackagesHash(rootPath, packagesPath)
  return Promise.all(
    orderedGraph.map(async node => ({
      ...node,
      data: await getPackageInfo({
        dockerRegistry,
        npmRegistry,
        dockerOrganizationName,
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

  await dockerRegistryLogin({
    dockerRegistry: options.dockerRegistry,
    dockerRegistryToken: options.auth.dockerRegistryToken,
    dockerRegistryUsername: options.auth.dockerRegistryUsername,
  })

  const redisClient = new Redis({
    host: options.redisServer.host,
    port: options.redisServer.port,
    ...(options.auth.redisPassword && { password: options.auth.redisPassword }),
  })

  const packagesPath = await getPackages(options.rootPath)
  const orderedGraph = await getOrderedGraph({
    rootPath: options.rootPath,
    packagesPath,
    dockerRegistry: options.dockerRegistry,
    dockerOrganizationName: options.dockerOrganizationName,
    npmRegistry: options.npmRegistry,
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
        dockerRegistry: options.dockerRegistry,
        npmRegistry: options.npmRegistry,
        dockerOrganizationName: options.dockerOrganizationName,
        auth: options.auth,
      })
    }
  }
  await redisClient.quit()
}
