import execa from 'execa'
import fs from 'fs-extra'
import path from 'path'
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

export async function getPackageInfo(packagePath: string, packageHash: string): Promise<PackageInfo> {
  const packageJson = await fs.readJson(path.join(packagePath, 'package.json'))
  // @ts-ignore
  const isDocker: boolean = await fs.exists(path.join(packagePath, 'Dockerfile'))
  const isNpm = !packageJson.private

  const targets: TargetInfo[] = []
  if (isNpm) {
    const npmLatestVersionInfo = await getNpmLatestVersionInfo(packageJson.name)
    targets.push({
      targetType: TargetType.npm,
      npm: {
        isAlreadyPublished: npmLatestVersionInfo?.latestVersionHash === packageHash,
        ...(npmLatestVersionInfo && {
          latestVersion: {
            version: npmLatestVersionInfo.latestVersion,
            hash: npmLatestVersionInfo.latestVersionHash,
          },
        }),
      },
    })
  }
  if (isDocker) {
    const dockerLatestTagInfo = await getDockerLatestTagInfo(packageJson.name)
    targets.push({
      targetType: TargetType.docker,
      docker: {
        isAlreadyPublished: dockerLatestTagInfo?.latestTagHash === packageHash,
        ...(dockerLatestTagInfo && {
          latestTag: {
            tag: dockerLatestTagInfo.latestTag,
            hash: dockerLatestTagInfo.latestTagHash,
          },
        }),
      },
    })
  }
  return {
    packagePath,
    packageJson,
    packageHash,
    targets,
  }
}
