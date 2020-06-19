/* eslint-disable no-console */

import { calculatePackagesHash } from './packages-hash'
import execa from 'execa'
import path from 'path'
import { getPackageInfo } from './package-info'
import { PackageInfo, Graph } from './types'
import { publish } from './publish'
import k8testLog from 'k8test-log'

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

async function getOrderedGraph(rootPath: string): Promise<Graph<PackageInfo>> {
  const packagesPath = await getPackages(rootPath)
  const orderedGraph = await calculatePackagesHash(rootPath, packagesPath)
  return Promise.all(
    orderedGraph.map(async node => ({
      ...node,
      data: await getPackageInfo(node.data.packagePath, node.data.packageHash),
    })),
  )
}

export async function ci(options: { rootPath: string; isMasterBuild: boolean; isDryRun: boolean; runTests: boolean }) {
  log('starting ci execution. options: %O', options)

  log('calculate hash of every package and check which packages we already published')

  const orderedGraph = await getOrderedGraph(options.rootPath)

  log('%d packages: %s', orderedGraph.length, orderedGraph.map(node => `"${node.data.packageJson.name}"`).join(', '))

  if (options.runTests) {
    await execa.command('yarn test', {
      cwd: options.rootPath,
      stdio: 'inherit',
    })
  }

  if (options.isMasterBuild) {
    await publish(orderedGraph, {
      isDryRun: options.isDryRun,
      rootPath: options.rootPath,
    })
  }
}

process.on('unhandledRejection', e => console.error(e))

// eslint-disable-next-line no-floating-promise/no-floating-promise
ci({ rootPath: '/Users/stavalfi-dev/projects/k8test', isDryRun: false, isMasterBuild: true, runTests: false }).then(x =>
  console.log(x),
)
