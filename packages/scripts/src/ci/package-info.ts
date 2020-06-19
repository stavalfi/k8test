import execa from 'execa'
import fs from 'fs-extra'
import path from 'path'
import { PackageInfo } from './types'

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
  const npmLatestVersionInfo = isNpm ? await getNpmLatestVersionInfo(packageJson.name) : undefined
  const dockerLatestTagInfo = isDocker ? await getDockerLatestTagInfo(packageJson.name) : undefined
  return {
    packagePath,
    packageJson,
    packageHash,
    ...(isNpm && {
      npm: {
        isAlreadyPublished: npmLatestVersionInfo?.latestVersionHash === packageHash,
        ...(npmLatestVersionInfo && {
          latestVersion: {
            version: npmLatestVersionInfo.latestVersion,
            hash: npmLatestVersionInfo.latestVersionHash,
          },
        }),
      },
    }),
    ...(isDocker && {
      docker: {
        isAlreadyPublished: dockerLatestTagInfo?.latestTagHash === packageHash,
        ...(dockerLatestTagInfo && {
          latestTag: {
            tag: dockerLatestTagInfo.latestTag,
            hash: dockerLatestTagInfo.latestTagHash,
          },
        }),
      },
    }),
  }
}
