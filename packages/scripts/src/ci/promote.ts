import execa from 'execa'
import fs from 'fs-extra'
import k8testLog from 'k8test-log'
import path from 'path'
import { Graph, PackageInfo, PromoteResult, TargetType, NpmTargetInfo, DockerTargetInfo } from './types'
import { shouldPromote } from './utils'

const log = k8testLog('scripts:ci:promote')

async function promoteNpm(packageInfo: Omit<PackageInfo, 'targets'>, target: NpmTargetInfo): Promise<PromoteResult> {
  log('promoting npm target in package: "%s"', packageInfo.packageJson.name)

  const npmLatestVersion = target.npm.latestVersion?.version

  if (npmLatestVersion && npmLatestVersion !== packageInfo.packageJson.version) {
    throw new Error(
      `mismatch: latest npm version of ${packageInfo.packagePath} in npm-registry is ${npmLatestVersion}, but in package.json it is: ${packageInfo.packageJson.version}. please make sure they are synced before you run this script again.`,
    )
  }

  await execa.command(`yarn --cwd ${packageInfo.packagePath} version --patch --no-git-tag-version`, {
    stdio: 'inherit',
  })

  const newVersion = (await fs.readJson(path.join(packageInfo.packagePath, 'package.json'))).version

  log(
    'promoted npm target in package: "%s" by mutating package.json to version: %s',
    packageInfo.packageJson.name,
    newVersion,
  )

  return { newVersion, packagePath: packageInfo.packagePath }
}

async function promoteDocker(
  packageInfo: Omit<PackageInfo, 'targets'>,
  target: DockerTargetInfo,
): Promise<PromoteResult> {
  log('promoting docker target in package: "%s"', packageInfo.packageJson.name)

  const dockerLatestTag = target.docker.latestTag?.tag

  if (dockerLatestTag && dockerLatestTag !== packageInfo.packageJson.version) {
    throw new Error(
      `mismatch: latest docker tag of ${packageInfo.packagePath} in docker-registry is ${dockerLatestTag}, but in package.json it is: ${packageInfo.packageJson.version}. please make sure they are synced before you run this script again.`,
    )
  }

  await execa.command(`yarn --cwd ${packageInfo.packagePath} version --patch --no-git-tag-version`, {
    stdio: 'inherit',
  })

  const newTag = (await fs.readJson(path.join(packageInfo.packagePath, 'package.json'))).version

  log(
    'promoted docker target in package: "%s" by mutating package.json to version: %s',
    packageInfo.packageJson.name,
    newTag,
  )

  return { newVersion: newTag, packagePath: packageInfo.packagePath }
}

export async function promote(orderedGraph: Graph<PackageInfo>) {
  const toPromote = orderedGraph.map(node => node.data).filter(shouldPromote)

  if (toPromote.length === 0) {
    log(`there is no need to promote anything. all packages that we should eventually publish, didn't change.`)
    return []
  } else {
    log('promoting the following packages: %s', toPromote.map(node => `"${node.packageJson.name}"`).join(', '))
    const result = await Promise.all(
      toPromote.map(node => {
        const npmTarget = node.targets.find(target => target.targetType === TargetType.npm) as NpmTargetInfo
        if (npmTarget) {
          return promoteNpm(node, npmTarget)
        }
        const dockerTarget = node.targets.find(target => target.targetType === TargetType.docker) as DockerTargetInfo
        if (dockerTarget) {
          return promoteDocker(node, dockerTarget)
        }
        throw new Error(`we can't be here`)
      }),
    )
    log(`promotion results: %O`, result)

    return result
  }
}
