import execa from 'execa'
import fs from 'fs-extra'
import path from 'path'
import semver from 'semver'
import { PackageInfo, TargetInfo, TargetType, ExtendedAuth } from './types'
import { Redis } from 'ioredis'
import k8testLog from 'k8test-log'
import { getDockerImageLabels } from './ci-logic'

const log = k8testLog('ci:package-info')

async function getNpmLatestVersionInfo(
  packageName: string,
  npmRegistryAddress: string,
  redisClient: Redis,
): Promise<
  | {
      latestVersion: string
      // it can be undefine if the ci failed after publishing the package but before setting this tag remotely.
      // in this case, the local-hash will be different and we will push again. its ok.
      latestVersionHash: string
    }
  | undefined
> {
  try {
    const command = `npm view ${packageName} --json --registry ${npmRegistryAddress}`
    log('searching the latest tag and hash: "%s"', command)
    const result = await execa.command(command)
    const resultJson = JSON.parse(result.stdout) || {}
    const distTags = resultJson['dist-tags'] as { [key: string]: string }
    const latestVersion = distTags['latest']
    const latestVersionHashResult =
      Object.entries(distTags).find(
        ([key, value]) => value === latestVersion && key.startsWith('latest-hash--'),
      )?.[0] || `latest-hash--could-not-find-remote-hash-that-points-to-version-${latestVersion}`
    const latest = {
      latestVersionHash: latestVersionHashResult.replace('latest-hash--', ''),
      latestVersion,
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

function calculateNewVersion(packageJsonVersion: string, latestPublishedVersion?: string): string {
  if (!latestPublishedVersion) {
    return packageJsonVersion
  }

  const maxVersion = semver.gt(packageJsonVersion, latestPublishedVersion) ? packageJsonVersion : latestPublishedVersion

  const newVersion = semver.inc(maxVersion, 'patch')
  if (!newVersion) {
    throw new Error(`could not path-increment version: ${maxVersion}`)
  }
  return newVersion
}

export async function getPackageInfo({
  dockerRegistryAddress,
  dockerOrganizationName,
  npmRegistryAddress,
  packageHash,
  packagePath,
  relativePackagePath,
  redisClient,
  auth,
  dockerRegistryProtocol,
}: {
  relativePackagePath: string
  packagePath: string
  packageHash: string
  npmRegistryAddress: string
  dockerRegistryAddress: string
  dockerRegistryProtocol: string
  dockerOrganizationName: string
  redisClient: Redis
  auth: Pick<ExtendedAuth, 'dockerRegistryApiToken'>
}): Promise<PackageInfo> {
  const packageJson = await fs.readJson(path.join(packagePath, 'package.json'))
  const isNpm = !packageJson.private
  // @ts-ignore
  const isDocker: boolean = await fs.exists(path.join(packagePath, 'Dockerfile'))
  const npmLatestVersionInfo = await getNpmLatestVersionInfo(packageJson.name, npmRegistryAddress, redisClient)
  const dockerLatestTagInfo = await getDockerImageLabels({
    dockerRegistryAddress,
    dockerOrganizationName,
    imageName: packageJson.name,
    dockerRegistryApiToken: auth.dockerRegistryApiToken,
    imageTag: 'latest',
    dockerRegistryProtocol,
  })

  const npmTarget: false | TargetInfo<TargetType.npm> = isNpm && {
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
          newVersion: calculateNewVersion(packageJson.version, npmLatestVersionInfo?.latestVersion),
          ...(npmLatestVersionInfo && {
            latestPublishedVersion: {
              version: npmLatestVersionInfo.latestVersion,
              hash: npmLatestVersionInfo.latestVersionHash,
            },
          }),
        }),
  }
  const dockerTarget: false | TargetInfo<TargetType.docker> = isDocker && {
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
          newVersion: calculateNewVersion(packageJson.version, dockerLatestTagInfo?.latestTag),
          ...(dockerLatestTagInfo && {
            latestPublishedVersion: {
              version: dockerLatestTagInfo.latestTag,
              hash: dockerLatestTagInfo.latestHash,
            },
          }),
        }),
  }

  const target = npmTarget || dockerTarget || undefined

  return {
    relativePackagePath,
    packagePath,
    packageJson,
    packageHash,
    target,
  }
}
