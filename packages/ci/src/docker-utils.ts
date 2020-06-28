import { Auth } from './types'
import got from 'got'

// TOKEN=$(curl -s -H "Content-Type: application/json" -X POST -d '{"username": "'${UNAME}'", "password": "'${UPASS}'"}' https://hub.docker.com/v2/users/login/ | jq -r .token)

// curl -u "$DOCKER_HUB_USERNAME:$DOCKER_HUB_TOKEN" "https://auth.docker.io/token?scope=repository:stavalfi/k8test-monitoring:pull&service=registry.docker.io"
export async function getDockerRegistryApiToken(auth: Auth): Promise<string | undefined> {
  if (auth.dockerRegistryUsername && auth.dockerRegistryToken) {
    return await got.post('https://hub.docker.com/v2/users/login/', {
      json: {
        username: auth.dockerRegistryUsername,
        password: auth.dockerRegistryToken,
      },
      resolveBodyOnly: true,
    })
  }
}

/*
export TOKEN="$(curl --silent --header 'GET' "https://auth.docker.io/token?service=registry.docker.io&scope=repository:stavalfi/k8test-monitoring:pull,push" | jq -r '.token')"  
curl \
--request 'GET' \
--header "Authorization: Bearer ${TOKEN}" \
"https://registry-1.docker.io/v2/stavalfi/k8test-monitoring/manifests/latest" \
| jq

*/
export async function getDockerImageLabels({
  imageName,
  imageTag,
  dockerOrganizationName,
  dockerRegistryApiToken,
  dockerRegistryAddress,
}: {
  imageName: string
  imageTag: string
  dockerOrganizationName: string
  dockerRegistryApiToken?: string
  dockerRegistryAddress: string
}): Promise<{ latestHash: string; latestTag: string }> {
  const {
    history: { v1Compatibility },
  } = await got.get<{ history: { v1Compatibility: string } }>(
    `${dockerRegistryAddress}/v2/${dockerOrganizationName}/${imageName}/manifests/${imageTag}"`,
    {
      resolveBodyOnly: true,
      headers: {
        ...(dockerRegistryApiToken && { Authorization: `Bearer ${dockerRegistryApiToken}` }),
      },
    },
  )

  const parsed: { config: { Labels: { 'latest-hash': string; 'latest-tag': string } } } = JSON.parse(v1Compatibility)

  return {
    latestHash: parsed.config.Labels['latest-hash'],
    latestTag: parsed.config.Labels['latest-tag'],
  }
}
