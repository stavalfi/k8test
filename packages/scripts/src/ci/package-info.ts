import execa from 'execa'
import fs from 'fs-extra'
import path from 'path'
import semver from 'semver'
import { PackageInfo, TargetInfo, TargetType } from './types'

async function getNpmLatestVersionInfo(
  packageName: string,
): Promise<{ latestVersionHash: string; latestVersion: string } | undefined> {
  try {
    const result = await execa.command(`npm view ${packageName} --json`)
    const resultJson = JSON.parse(result.stdout) || {}
    const distTags = resultJson['dist-tags']
    return {
      latestVersionHash: distTags['latest-hash'],
      latestVersion: distTags['latest'],
    }
  } catch (e) {
    if (!e.message.includes('code E404')) {
      throw e
    }
  }
}

async function getDockerLatestTagInfo(
  imageNameWithRepository: string,
): Promise<{ latestTagHash: string; latestTag: string } | undefined> {
  try {
    const result = await execa.command(
      `skopeo inspect docker://docker.io/stavalfi/${imageNameWithRepository}:latest --raw`,
    )
    const resultJson = JSON.parse(result.stdout) || {}
    return {
      latestTagHash: resultJson.Labels?.['latest-hash'],
      latestTag: resultJson.Labels?.['latest-tag'],
    }
  } catch (e) {
    if (!e.stderr.includes('authentication required')) {
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

export async function getPackageInfo(packagePath: string, packageHash: string): Promise<PackageInfo> {
  const packageJson = await fs.readJson(path.join(packagePath, 'package.json'))
  const isNpm = !packageJson.private
  // @ts-ignore
  const isDocker: boolean = await fs.exists(path.join(packagePath, 'Dockerfile'))
  const npmLatestVersionInfo = await getNpmLatestVersionInfo(packageJson.name)
  const dockerLatestTagInfo = await getDockerLatestTagInfo(packageJson.name)

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
    packagePath,
    packageJson,
    packageHash,
    target,
  }
}
