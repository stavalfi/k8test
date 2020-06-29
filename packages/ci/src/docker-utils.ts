import { Auth } from './types'
import got from 'got'
import k8testLog from 'k8test-log'

const log = k8testLog('ci:docker-utils')

/*
#!/usr/bin/env bash
repo=stavalfi/k8test-monitoring                                                                                                                                                                                 
token=$(curl -s "https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull" | jq -r '.token')
echo $token
*/
export async function getDockerRegistryApiToken({
  auth,
  dockerRegistryAddress,
  dockerRegistryProtocol,
}: {
  dockerRegistryAddress: string
  dockerRegistryProtocol: string
  auth: Auth
}): Promise<string | undefined> {
  if (auth.dockerRegistryUsername && auth.dockerRegistryToken) {
    return await got.post(`${dockerRegistryProtocol}://${dockerRegistryAddress}/v2/users/login/`, {
      json: {
        username: auth.dockerRegistryUsername,
        password: auth.dockerRegistryToken,
      },
      resolveBodyOnly: true,
    })
  }
}

/*
#!/usr/bin/env bash
repo=stavalfi/k8test-monitoring                                                                                                                                                                                 
token=$(curl -s "https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull" | jq -r '.token')
digest=$(curl -s -H "Accept: application/vnd.docker.distribution.manifest.v2+json" -H "Authorization: Bearer $token" "https://registry-1.docker.io/v2/${repo}/manifests/latest" | jq .config.digest -r)
curl -s -L -H "Accept: application/vnd.docker.distribution.manifest.v2+json" -H "Authorization: Bearer $token" "https://registry-1.docker.io/v2/${repo}/blobs/$digest" | jq .config.Labels
*/
export async function getDockerImageLabels({
  imageName,
  imageTag,
  dockerOrganizationName,
  dockerRegistryApiToken,
  dockerRegistryAddress,
  dockerRegistryProtocol,
}: {
  imageName: string
  imageTag: string
  dockerOrganizationName: string
  dockerRegistryApiToken?: string
  dockerRegistryAddress: string
  dockerRegistryProtocol: string
}): Promise<{ latestHash: string; latestTag: string } | undefined> {
  const fullImageName = `${dockerRegistryAddress}/${dockerOrganizationName}/${imageName}:${imageTag}`
  try {
    log('searching the latest tag and hash for image "%s"', fullImageName)
    console.log(`http://localhost:5000/v2/stavalfi/k8test-monitoring/manifests/latest`)
    const x = await got.get<{ config: { digest: string } }>(
      'http://localhost:5000/v2/stavalfi/k8test-monitoring/manifests/latest',
      {
        resolveBodyOnly: true,
        headers: {
          Accept: 'application/vnd.docker.distribution.manifest.v2+json',
          ...(dockerRegistryApiToken && { Authorization: `Bearer ${dockerRegistryApiToken}` }),
        },
      },
    )

    console.log(x, `${dockerRegistryAddress}/v2/${dockerOrganizationName}/${imageName}/blobs/$${1}`)
    console.log('stav1')
    const {
      config: { Labels },
    } = await got.get<{ config: { Labels: { 'latest-hash': string; 'latest-tag': string } } }>(
      `${dockerRegistryAddress}/v2/${dockerOrganizationName}/${imageName}/blobs/$${1}`,
      {
        resolveBodyOnly: true,
        headers: {
          Accept: 'application/vnd.docker.distribution.manifest.v2+json',
          ...(dockerRegistryApiToken && { Authorization: `Bearer ${dockerRegistryApiToken}` }),
        },
      },
    )

    const result = {
      latestHash: Labels['latest-hash'],
      latestTag: Labels['latest-tag'],
    }
    log('latest tag and hash for "%s" are: "%O"', fullImageName, result)
    return result
  } catch (e) {
    console.log(e)
    if (e.stderr.includes('authentication required') || e.stderr.includes('manifest unknown')) {
      log(`"%s" weren't published`, fullImageName)
    } else {
      throw e
    }
  }
}
