import execa from 'execa'
import k8testLog from 'k8test-log'

const log = k8testLog('ci:docker-utils')

/*
todo: remove skopeo and use docker v2 api. it's not working when trying to use the following commands with unsecure-local-registry

#!/usr/bin/env bash
repo=stavalfi/k8test-monitoring                                                                                                                                                                                 
token=$(curl -s "https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull" | jq -r '.token')
digest=$(curl -s -H "Accept: application/vnd.docker.distribution.manifest.v2+json" -H "Authorization: Bearer $token" "https://registry-1.docker.io/v2/${repo}/manifests/latest" | jq .config.digest -r)
curl -s -L -H "Accept: application/vnd.docker.distribution.manifest.v2+json" -H "Authorization: Bearer $token" "https://registry-1.docker.io/v2/${repo}/blobs/$digest" | jq .config.Labels
*/
export async function getDockerImageLabelsAndTags({
  imageName,
  imageTag,
  dockerOrganizationName,
  dockerRegistryAddress,
  dockerRegistryProtocol,
}: {
  imageName: string
  imageTag: string
  dockerOrganizationName: string
  dockerRegistryAddress: string
  dockerRegistryProtocol: string
}): Promise<{ latestHash?: string; latestTag?: string; allTags: string[] } | undefined> {
  const fullImageName = `${dockerRegistryAddress}/${dockerOrganizationName}/${imageName}:${imageTag}`
  try {
    log('searching the latest tag and hash for image "%s"', fullImageName)

    const { stdout } = await execa.command(
      `skopeo inspect ${dockerRegistryProtocol === 'http' ? '--tls-verify=false' : ''} docker://${fullImageName}`,
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
