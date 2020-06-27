import execa from 'execa'
import fs from 'fs-extra'
import path from 'path'
import semver from 'semver'
import { PackageInfo, TargetInfo, TargetType } from './types'
import { Redis } from 'ioredis'
import k8testLog from 'k8test-log'

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

async function getDockerLatestTagInfo(
  imageNameWithRepository: string,
  dockerRegistryAddress: string,
  redisClient: Redis,
): Promise<{ latestTagHash: string; latestTag: string } | undefined> {
  try {
    const command = `skopeo inspect --tls-verify=false docker://${dockerRegistryAddress}/${imageNameWithRepository}:latest`
    log('searching the latest tag and hash: "%s"', command)
    const result = await execa.command(command)
    const resultJson = JSON.parse(result.stdout) || {}
    const latest = {
      latestTagHash: resultJson.Labels?.['latest-hash'],
      latestTag: resultJson.Labels?.['latest-tag'],
    }
    log('latest tag and hash for "%s" are: "%O"', imageNameWithRepository, latest)
    return latest
  } catch (e) {
    if (e.stderr.includes('authentication required') || e.stderr.includes('manifest unknown')) {
      log(`"%s" weren't published`, imageNameWithRepository)
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
  dockerRepositoryName,
  npmRegistryAddress,
  packageHash,
  packagePath,
  relativePackagePath,
  redisClient,
}: {
  relativePackagePath: string
  packagePath: string
  packageHash: string
  npmRegistryAddress: string
  dockerRegistryAddress: string
  dockerRepositoryName: string
  redisClient: Redis
}): Promise<PackageInfo> {
  const packageJson = await fs.readJson(path.join(packagePath, 'package.json'))
  const isNpm = !packageJson.private
  // @ts-ignore
  const isDocker: boolean = await fs.exists(path.join(packagePath, 'Dockerfile'))
  const npmLatestVersionInfo = await getNpmLatestVersionInfo(packageJson.name, npmRegistryAddress, redisClient)
  const dockerLatestTagInfo = await getDockerLatestTagInfo(
    `${dockerRepositoryName}/${packageJson.name}`,
    dockerRegistryAddress,
    redisClient,
  )

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
    ...(dockerLatestTagInfo?.latestTagHash === packageHash
      ? {
          needPublish: false,
          latestPublishedVersion: {
            version: dockerLatestTagInfo.latestTag,
            hash: dockerLatestTagInfo.latestTagHash,
          },
        }
      : {
          needPublish: true,
          newVersion: calculateNewVersion(packageJson.version, dockerLatestTagInfo?.latestTag),
          ...(dockerLatestTagInfo && {
            latestPublishedVersion: {
              version: dockerLatestTagInfo.latestTag,
              hash: dockerLatestTagInfo.latestTagHash,
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
