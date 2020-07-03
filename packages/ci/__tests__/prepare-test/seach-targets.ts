import execa from 'execa'
import semver from 'semver'
import { getDockerImageLabelsAndTags } from '../../src/docker-utils'
import { ServerInfo } from '../../src/types'

export async function latestNpmPackageDistTags(
  packageName: string,
  npmRegistry: ServerInfo,
): Promise<{ [key: string]: string } | undefined> {
  try {
    const npmRegistryAddress = `${npmRegistry.protocol}://${npmRegistry.host}:${npmRegistry.port}`

    const result = await execa.command(`npm view ${packageName} --json --registry ${npmRegistryAddress}`)
    const resultJson = JSON.parse(result.stdout) || {}
    const distTags = resultJson['dist-tags'] as { [key: string]: string }
    return distTags
  } catch (e) {
    if (!e.message.includes('code E404')) {
      throw e
    }
  }
}

export async function latestNpmPackageVersion(
  packageName: string,
  npmRegistry: ServerInfo,
): Promise<string | undefined> {
  const distTags = await latestNpmPackageDistTags(packageName, npmRegistry)
  return distTags?.['latest']
}

export async function publishedNpmPackageVersions(packageName: string, npmRegistry: ServerInfo): Promise<string[]> {
  try {
    const npmRegistryAddress = `${npmRegistry.protocol}://${npmRegistry.host}:${npmRegistry.port}`
    const result = await execa.command(`npm view ${packageName} --json --registry ${npmRegistryAddress}`)
    const resultJson = JSON.parse(result.stdout) || {}
    return resultJson.versions
  } catch (e) {
    if (e.message.includes('code E404')) {
      return []
    } else {
      throw e
    }
  }
}

export async function latestDockerImageTag(
  packageJsonName: string,
  dockerOrganizationName: string,
  dockerRegistry: ServerInfo,
): Promise<string | undefined> {
  try {
    const result = await getDockerImageLabelsAndTags({
      dockerOrganizationName,
      packageJsonName,
      imageTag: 'latest',
      dockerRegistry,
    })
    return result?.latestTag
  } catch (e) {
    if (e.stderr.includes('authentication required') || e.stderr.includes('manifest unknown')) {
      return ''
    } else {
      throw e
    }
  }
}

export async function publishedDockerImageTags(
  packageJsonName: string,
  dockerOrganizationName: string,
  dockerRegistry: ServerInfo,
): Promise<string[]> {
  try {
    const result = await getDockerImageLabelsAndTags({
      dockerOrganizationName,
      packageJsonName,
      imageTag: 'latest',
      dockerRegistry,
    })
    return result?.allTags?.filter((tag: string) => semver.valid(tag) || tag === 'latest').filter(Boolean) || []
  } catch (e) {
    if (e.stderr.includes('authentication required') || e.stderr.includes('manifest unknown')) {
      return []
    } else {
      throw e
    }
  }
}
