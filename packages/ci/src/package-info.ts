import execa from 'execa'
import fs from 'fs-extra'
import { Redis } from 'ioredis'
import k8testLog from 'k8test-log'
import path from 'path'
import { getDockerImageLabelsAndTags } from './docker-utils'
import { PackageInfo, ServerInfo, TargetInfo, TargetType } from './types'
import { calculateNewVersion } from './versions'
import { IPackageJson } from 'package-json-type'

const log = k8testLog('ci:package-info')

async function getNpmLatestVersionInfo(
  packageName: string,
  npmRegistry: ServerInfo,
  redisClient: Redis,
): Promise<
  | {
      latestVersion?: string
      // it can be undefine if the ci failed after publishing the package but before setting this tag remotely.
      // in this case, the local-hash will be different and we will push again. its ok.
      latestVersionHash?: string
      allVersions: string[]
    }
  | undefined
> {
  try {
    const command = `npm view ${packageName} --json --registry ${npmRegistry.protocol}://${npmRegistry.host}:${npmRegistry.port}`
    log('searching the latest tag and hash: "%s"', command)
    const result = await execa.command(command)
    const resultJson = JSON.parse(result.stdout) || {}
    const allVersions: string[] = resultJson['versions'] || []
    const distTags = resultJson['dist-tags'] as { [key: string]: string }
    const latestVersion = distTags['latest']
    const latestVersionHashResult = Object.entries(distTags).find(
      ([key, value]) => value === latestVersion && key.startsWith('latest-hash--'),
    )?.[0]

    const latest = {
      latestVersionHash: latestVersionHashResult?.replace('latest-hash--', ''),
      latestVersion,
      allVersions,
    }
    log('latest tag and hash for "%s" are: "%O"', packageName, latest)
    return latest
  } catch (e) {
    if (e.message.includes('code E404')) {
      log(`"%s" weren't published`, packageName)
    } else {
      throw e
    }
  }
}

async function isNpmTarget({
  packageJson,
  npmRegistry,
  redisClient,
  packageHash,
  packagePath,
}: {
  packageJson: IPackageJson
  npmRegistry: ServerInfo
  redisClient: Redis
  packageHash: string
  packagePath: string
}): Promise<TargetInfo<TargetType.npm> | undefined> {
  const isNpm = !packageJson.private
  if (isNpm) {
    if (!packageJson.name) {
      throw new Error(`package.json of: ${packagePath} must have a name property.`)
    }
    if (!packageJson.version) {
      throw new Error(`package.json of: ${packagePath} must have a version property.`)
    }
    const npmLatestVersionInfo = await getNpmLatestVersionInfo(packageJson.name, npmRegistry, redisClient)
    return {
      targetType: TargetType.npm,
      ...(npmLatestVersionInfo?.latestVersionHash === packageHash
        ? {
            needPublish: false,
            latestPublishedVersion: {
              version: npmLatestVersionInfo.latestVersion,
              hash: npmLatestVersionInfo.latestVersionHash,
            },
          }
        : {
            needPublish: true,
            newVersion: calculateNewVersion({
              packagePath,
              packageJsonVersion: packageJson.version,
              latestPublishedVersion: npmLatestVersionInfo?.latestVersion,
              allVersions: npmLatestVersionInfo?.allVersions,
            }),
            ...(npmLatestVersionInfo && {
              latestPublishedVersion: {
                version: npmLatestVersionInfo.latestVersion,
                hash: npmLatestVersionInfo.latestVersionHash,
              },
            }),
          }),
    }
  }
}

async function isDockerTarget({
  packageJson,
  dockerOrganizationName,
  dockerRegistry,
  redisClient,
  packageHash,
  packagePath,
}: {
  packageJson: IPackageJson
  dockerRegistry: ServerInfo
  dockerOrganizationName: string
  redisClient: Redis
  packageHash: string
  packagePath: string
}): Promise<TargetInfo<TargetType.docker> | undefined> {
  // @ts-ignore
  const isDocker: boolean = await fs.exists(path.join(packagePath, 'Dockerfile'))
  if (isDocker) {
    if (!packageJson.name) {
      throw new Error(`package.json of: ${packagePath} must have a name property.`)
    }
    if (!packageJson.version) {
      throw new Error(`package.json of: ${packagePath} must have a version property.`)
    }
    const dockerLatestTagInfo = await getDockerImageLabelsAndTags({
      dockerRegistry,
      dockerOrganizationName,
      packageJsonName: packageJson.name,
    })
    return {
      targetType: TargetType.docker,
      ...(dockerLatestTagInfo?.latestHash === packageHash
        ? {
            needPublish: false,
            latestPublishedVersion: {
              version: dockerLatestTagInfo.latestTag,
              hash: dockerLatestTagInfo.latestHash,
            },
          }
        : {
            needPublish: true,
            newVersion: calculateNewVersion({
              packagePath,
              packageJsonVersion: packageJson.version,
              latestPublishedVersion: dockerLatestTagInfo?.latestTag,
              allVersions: dockerLatestTagInfo?.allTags,
            }),
            ...(dockerLatestTagInfo && {
              latestPublishedVersion: {
                version: dockerLatestTagInfo.latestTag,
                hash: dockerLatestTagInfo.latestHash,
              },
            }),
          }),
    }
  }
}

export async function getPackageInfo({
  dockerOrganizationName,
  packageHash,
  packagePath,
  relativePackagePath,
  redisClient,
  dockerRegistry,
  npmRegistry,
}: {
  relativePackagePath: string
  packagePath: string
  packageHash: string
  npmRegistry: ServerInfo
  dockerRegistry: ServerInfo
  dockerOrganizationName: string
  redisClient: Redis
}): Promise<PackageInfo> {
  const packageJson: IPackageJson = await fs.readJson(path.join(packagePath, 'package.json'))

  const [npmTarget, dockerTarget] = await Promise.all([
    isNpmTarget({
      packageHash,
      packagePath,
      redisClient,
      npmRegistry,
      packageJson,
    }),
    isDockerTarget({
      packageHash,
      packagePath,
      redisClient,
      dockerOrganizationName,
      dockerRegistry,
      packageJson,
    }),
  ])

  return {
    relativePackagePath,
    packagePath,
    packageJson,
    packageHash,
    target: npmTarget || dockerTarget,
  }
}
