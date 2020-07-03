import execa from 'execa'
import fs from 'fs-extra'
import { Redis } from 'ioredis'
import k8testLog from 'k8test-log'
import path from 'path'
import semver from 'semver'
import { getDockerImageLabelsAndTags } from './docker-utils'
import { PackageInfo, ServerInfo, TargetInfo, TargetType } from './types'

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

function calculateNewVersion({
  packagePath,
  packageJsonVersion,
  allVersions,
  latestPublishedVersion,
}: {
  packagePath: string
  packageJsonVersion: string
  latestPublishedVersion?: string
  allVersions?: string[]
}): string {
  if (!semver.valid(packageJsonVersion)) {
    throw new Error(`version packgeJson in ${packagePath} is invalid: ${packageJsonVersion}`)
  }
  const allValidVersions = allVersions?.filter(version => semver.valid(version))

  if (!allValidVersions?.length) {
    // this is immutable in each registry so if this is not defined or empty, it means that we never published before or there was unpublish of all the versions.
    return packageJsonVersion
  }

  const incVersion = (version: string) => {
    if (!semver.valid(version)) {
      throw new Error(`version is invalid: ${version} in ${packagePath}`)
    }
    const newVersion = semver.inc(version, 'patch')
    if (!newVersion) {
      throw new Error(`could not path-increment version: ${version} in ${packagePath}`)
    }
    return newVersion
  }

  if (!latestPublishedVersion) {
    // this is mutable in each registry so if we have versions but this is false, it means that:
    // a. this is the first run of the ci on a target that was already pbulished.
    // b. or, less likely, someone mutated one of the labels that this ci is modifying in every run :(

    if (allValidVersions.includes(packageJsonVersion)) {
      return incVersion(packageJsonVersion)
    } else {
      return packageJsonVersion
    }
  } else {
    if (allValidVersions.includes(latestPublishedVersion)) {
      const maxVersion = semver.gt(packageJsonVersion, latestPublishedVersion)
        ? packageJsonVersion
        : latestPublishedVersion

      if (allVersions?.includes(maxVersion)) {
        return incVersion(maxVersion)
      } else {
        return maxVersion
      }
    } else {
      const sorted = semver.sort(allValidVersions)

      return incVersion(sorted[sorted.length - 1])
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
  const packageJson = await fs.readJson(path.join(packagePath, 'package.json'))
  const isNpm = !packageJson.private
  // @ts-ignore
  const isDocker: boolean = await fs.exists(path.join(packagePath, 'Dockerfile'))
  const npmLatestVersionInfo = await getNpmLatestVersionInfo(packageJson.name, npmRegistry, redisClient)
  const dockerLatestTagInfo = await getDockerImageLabelsAndTags({
    dockerRegistry,
    dockerOrganizationName,
    packageJsonName: packageJson.name,
    imageTag: 'latest',
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

  const target = npmTarget || dockerTarget || undefined

  return {
    relativePackagePath,
    packagePath,
    packageJson,
    packageHash,
    target,
  }
}
