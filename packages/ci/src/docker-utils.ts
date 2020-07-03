import execa from 'execa'
import k8testLog from 'k8test-log'
import { ServerInfo } from './types'

const log = k8testLog('ci:docker-utils')

export async function dockerRegistryLogin({
  dockerRegistry,
  dockerRegistryToken,
  dockerRegistryUsername,
}: {
  dockerRegistryUsername?: string
  dockerRegistryToken?: string
  dockerRegistry: ServerInfo
}) {
  if (dockerRegistryUsername && dockerRegistryToken) {
    log(
      'logging in to docker-registry: %s',
      `${dockerRegistry.protocol}://${dockerRegistry.host}:${dockerRegistry.port}`,
    )
    // I need to login to read and push from `dockerRegistryUsername` repository	  log('logged in to docker-hub registry')
    await execa.command(`docker login --username=${dockerRegistryUsername} --password=${dockerRegistryToken}`, {
      stdio: 'pipe',
    })
    log('logged in to docker-registry')
  }
}

export const buildDockerImageName = (packageJsonName: string) => {
  return packageJsonName.replace('/', '-').replace('@', '')
}

export const buildFullDockerImageName = ({
  dockerOrganizationName,
  dockerRegistry,
  packageJsonName,
  imageTag,
}: {
  dockerRegistry: ServerInfo
  dockerOrganizationName: string
  packageJsonName: string
  imageTag: string
}) => {
  return `${dockerRegistry.host}:${dockerRegistry.port}/${dockerOrganizationName}/${buildDockerImageName(
    packageJsonName,
  )}:${imageTag}`
}

/*
todo: remove skopeo and use docker v2 api. it's not working when trying to use the following commands with unsecure-local-registry

#!/usr/bin/env bash
repo=stavalfi/k8test-monitoring                                                                                                                                                                                 
token=$(curl -s "https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull" | jq -r '.token')
digest=$(curl -s -H "Accept: application/vnd.docker.distribution.manifest.v2+json" -H "Authorization: Bearer $token" "https://registry-1.docker.io/v2/${repo}/manifests/latest" | jq .config.digest -r)
curl -s -L -H "Accept: application/vnd.docker.distribution.manifest.v2+json" -H "Authorization: Bearer $token" "https://registry-1.docker.io/v2/${repo}/blobs/$digest" | jq .config.Labels
*/
export async function getDockerImageLabelsAndTags({
  packageJsonName,
  imageTag,
  dockerOrganizationName,
  dockerRegistry,
}: {
  packageJsonName: string
  imageTag: string
  dockerOrganizationName: string
  dockerRegistry: ServerInfo
}): Promise<{ latestHash?: string; latestTag?: string; allTags: string[] } | undefined> {
  const fullImageName = buildFullDockerImageName({
    dockerOrganizationName,
    dockerRegistry,
    packageJsonName,
    imageTag,
  })
  try {
    log('searching the latest tag and hash for image "%s"', fullImageName)

    const { stdout } = await execa.command(
      `skopeo inspect ${dockerRegistry.protocol === 'http' ? '--tls-verify=false' : ''} docker://${fullImageName}`,
    )
    const { Labels, RepoTags } = JSON.parse(stdout)

    log(`labels of image "${fullImageName}": ${Labels}`)
    const result = {
      latestHash: Labels['latest-hash'],
      latestTag: Labels['latest-tag'],
      allTags: RepoTags || [],
    }
    log('latest tag and hash for "%s" are: "%O"', fullImageName, result)
    if (!result.latestHash || !result.latestTag) {
      log(
        `one of %O is falsy. maybe someone in your team manually did that or we have a bug. anyways we have a fall-back plan - don't worry.`,
        result,
        fullImageName,
      )
    }
    return result
  } catch (e) {
    if (e.stderr?.includes('authentication required') || e.stderr?.includes('manifest unknown')) {
      log(`"%s" weren't published before so we can't find this image`, fullImageName)
    } else {
      throw e
    }
  }
}