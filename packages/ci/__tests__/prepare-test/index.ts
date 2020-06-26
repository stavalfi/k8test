import chance from 'chance'
import execa from 'execa'
import got from 'got'
import { SingletonStrategy, subscribe, Subscription } from 'k8test'
import path from 'path'
import semver from 'semver'
import { ciOptions } from '../../src/ci-logic'
import { createRepo } from './create-repo'
import { GitServer, starGittServer } from './git-server-testkit'
import { NewEnvFunc, PublishedPackageInfo, TargetType } from './types'
import Redis from 'ioredis'

const ciCliPath = path.join(__dirname, '../../dist/src/index.js')

const runCiCli = async (options: ciOptions) => {
  const command = `\
  ${ciCliPath}\
    --cwd ${options.rootPath} \
    --master-build=${options.isMasterBuild} \
    --dry-run=${options.isDryRun} \
    --run-tests=${options.runTests} \
    --docker-registry ${options.dockerRegistryAddress} \
    --npm-registry ${options.npmRegistryAddress} \
    --git-server-domain ${options.gitServerDomain} \
    --docker-repository ${options.dockerRepositoryName} \
    --git-organization ${options.gitOrganizationName} \
    --git-repository ${options.gitRepositoryName} \
    ${options.auth.dockerRegistryToken ? `--docker-registry-token ${options.auth.dockerRegistryToken}` : ''} \
    ${options.auth.dockerRegistryUsername ? `--docker-registry-username ${options.auth.dockerRegistryUsername}` : ''} \
    --git-server-token ${options.auth.gitServerToken} \
    --git-server-username ${options.auth.gitServerUsername} \
    --npm-registry-token ${options.auth.npmRegistryToken} \
    --git-server-connection-type ${options.gitServerConnectionType} \
    ${options.auth.redisPassword ? `--redis-password ${options.auth.redisPassword}` : ''} \
    --redis-endpoint ${options.redisIp}:${options.redisPort}
  `
  return execa.command(command, {
    stdio: 'inherit',
  })
}

async function latestNpmPackageVersion(packageName: string, npmRegistryAddress: string): Promise<string> {
  const result = await execa.command(`npm view ${packageName} --json --registry ${npmRegistryAddress}`)
  const resultJson = JSON.parse(result.stdout) || {}
  const distTags = resultJson['dist-tags'] as { [key: string]: string }
  return distTags['latest']
}

async function publishedNpmPackageVersions(packageName: string, npmRegistryAddress: string): Promise<string[]> {
  try {
    const result = await execa.command(`npm view ${packageName} --json --registry ${npmRegistryAddress}`)
    const resultJson = JSON.parse(result.stdout) || {}
    return resultJson.version
  } catch (e) {
    if (e.message.includes('code E404')) {
      return []
    } else {
      throw e
    }
  }
}

async function latestDockerImageTag(
  imageName: string,
  dockerRepositoryName: string,
  dockerRegistryAddress: string,
): Promise<string> {
  const result = await execa.command(
    `skopeo inspect --tls-verify=false docker://${dockerRegistryAddress}/${dockerRepositoryName}/${imageName}:latest`,
  )
  const resultJson = JSON.parse(result.stdout) || {}
  return resultJson.Labels?.['latest-tag']
}

async function publishedDockerImageTags(
  imageName: string,
  dockerRepositoryName: string,
  dockerRegistryAddress: string,
): Promise<string[]> {
  try {
    const result = await execa.command(
      `skopeo inspect  --tls-verify=false docker://${dockerRegistryAddress}/${dockerRepositoryName}/${imageName}:latest`,
    )
    const resultJson = JSON.parse(result.stdout) || {}
    return resultJson.RepoTags?.filter((tag: string) => semver.valid(tag)).filter(Boolean) || []
  } catch (e) {
    if (e.stderr.includes('authentication required') || e.stderr.includes('manifest unknown')) {
      return []
    } else {
      throw e
    }
  }
}

const isRedisReadyPredicate = (url: string, host: string, port: number) => {
  const redis = new Redis({
    host,
    port,
    lazyConnect: true, // because i will try to connect manually in the next line
    connectTimeout: 1000,
  })

  return redis.connect().finally(() => {
    try {
      redis.disconnect()
    } catch {
      // ignore error
    }
  })
}

export const newEnv: NewEnvFunc = () => {
  let dockerRegistry: {
    containerId: string
    port: string
    ip: string
  }
  let npmRegistryDeployment: Subscription
  let redisDeployment: Subscription
  let gitServer: GitServer

  beforeEach(async () => {
    gitServer = await starGittServer()
  })
  afterEach(async () => {
    gitServer.close()
  })
  beforeAll(async () => {
    const deployments = await Promise.all([
      subscribe({
        imageName: 'verdaccio/verdaccio',
        imagePort: 4873,
        isReadyPredicate: url =>
          got.get(url, {
            timeout: 100,
          }),
        singletonStrategy: SingletonStrategy.oneInNamespace,
        namespaceName: 'k8test-ci',
      }),
      subscribe({
        imageName: 'redis',
        imagePort: 6379,
        singletonStrategy: SingletonStrategy.oneInNamespace,
        isReadyPredicate: isRedisReadyPredicate,
        namespaceName: 'k8test-ci',
      }),
    ])
    npmRegistryDeployment = deployments[0]
    redisDeployment = deployments[1]
    // I can't use k8s for docker-registry so easly: https://stackoverflow.com/questions/62596124/how-to-setup-docker-registry-in-k8s-cluster
    const { stdout: dockerRegistryContainerId } = await execa.command(`docker run -d -p 0:5000 registry:2`)
    const { stdout: dockerRegistryPort } = await execa.command(
      `docker inspect --format="{{(index (index .NetworkSettings.Ports \\"5000/tcp\\") 0).HostPort}}" ${dockerRegistryContainerId}`,
      {
        shell: true,
      },
    )
    dockerRegistry = {
      containerId: dockerRegistryContainerId,
      port: dockerRegistryPort,
      ip: 'localhost',
    }
  })
  afterAll(async () => {
    await Promise.all([
      npmRegistryDeployment.unsubscribe(),
      execa
        .command(`docker kill ${dockerRegistry.containerId}`)
        .then(() => execa.command(`docker rm ${dockerRegistry.containerId}`)),
    ])
  })

  return async (repo = {}) => {
    const resourcesNamesPostfix = chance()
      .hash()
      .slice(0, 8)

    const toActualName = (name: string) => `${name}-${resourcesNamesPostfix}`

    const { repoPath, repoName, repoOrg } = await createRepo(repo, gitServer, toActualName)

    return async ({ isMasterBuild, isDryRun, runTests }) => {
      const dockerRepositoryName = toActualName('repo')
      const dockerIpWithPort = `${dockerRegistry.ip}:${dockerRegistry.port}`
      const npmIpWithPort = `http://${npmRegistryDeployment.deployedImageIp}:${npmRegistryDeployment.deployedImagePort}`

      await runCiCli({
        isMasterBuild,
        runTests: Boolean(runTests),
        isDryRun: Boolean(isDryRun),
        dockerRegistryAddress: dockerIpWithPort,
        npmRegistryAddress: npmIpWithPort,
        gitServerConnectionType: gitServer.getConnectionType(),
        gitServerDomain: gitServer.getDomain(),
        dockerRepositoryName,
        gitOrganizationName: repoOrg,
        gitRepositoryName: repoName,
        rootPath: repoPath,
        redisIp: redisDeployment.deployedImageIp,
        redisPort: redisDeployment.deployedImagePort,
        auth: {
          npmRegistryToken: 'cm95IHNvbW1lciB3YXMgaGVyZQ==',
          gitServerToken: gitServer.getToken(),
          gitServerUsername: gitServer.getUsername(),
        },
      })

      const published = await Promise.all(
        repo.packages
          ?.filter(packageInfo => packageInfo.targetType === TargetType.npm)
          ?.map(packageInfo => packageInfo.name)
          ?.map<Promise<[string, PublishedPackageInfo]>>(async packageName => {
            const actualName = toActualName(packageName)
            const [versions, latestVersion, tags, latestTag] = await Promise.all([
              publishedNpmPackageVersions(actualName, npmIpWithPort),
              latestNpmPackageVersion(actualName, npmIpWithPort),
              publishedDockerImageTags(actualName, dockerRepositoryName, dockerIpWithPort),
              latestDockerImageTag(actualName, dockerRepositoryName, dockerIpWithPort),
            ])
            return [
              packageName,
              {
                npm: {
                  versions,
                  latestVersion,
                },
                docker: {
                  tags,
                  latestTag,
                },
              },
            ]
          }) || [],
      )

      return {
        published: new Map(published),
      }
    }
  }
}
