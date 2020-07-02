import execa from 'execa'
import semver from 'semver'
import { getDockerImageLabelsAndTags } from '../../src/docker-utils'
import { ServerInfo } from '../../src/types'

export async function latestNpmPackageVersion(
  packageName: string,
  npmRegistryAddress: string,
): Promise<string | undefined> {
  try {
    const result = await execa.command(`npm view ${packageName} --json --registry ${npmRegistryAddress}`)
    const resultJson = JSON.parse(result.stdout) || {}
    const distTags = resultJson['dist-tags'] as { [key: string]: string }
    return distTags['latest']
  } catch (e) {
    if (!e.message.includes('code E404')) {
      throw e
    }
  }
}

export async function publishedNpmPackageVersions(packageName: string, npmRegistryAddress: string): Promise<string[]> {
  try {
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
