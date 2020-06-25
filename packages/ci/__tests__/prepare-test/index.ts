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

function cleanupAfterEach() {
  const cleanups: (() => Promise<unknown> | unknown)[] = []

  afterEach(async () => {
    await Promise.all(cleanups.map(cleanup => cleanup())).catch(e => {
      // eslint-disable-next-line no-console
      console.error(JSON.stringify(e, null, 2))
      throw e
    })
    cleanups.splice(0, cleanups.length)
  })

  return cleanups
}

const ciCliPath = require.resolve(path.join(__dirname, '../../dist/src/index.js'))

const runCiCli = async (options: ciOptions) => {
  const command = `\
  ${ciCliPath}\
    --cwd "${options.rootPath}" \
    --master-build=${options.isMasterBuild} \
    --dry-run=${options.isDryRun} \
    --run-tests=${options.runTests} \
    --docker-registry "${options.dockerRegistryAddress}" \
    --npm-registry "${options.npmRegistryAddress}" \
    --git-server-domain "${options.gitServerDomain}" \
    --docker-repository "${options.dockerRepositoryName}" \
    --git-organization "${options.gitOrganizationName}" \
    --git-repository "${options.gitRepositoryName}" \
    ${options.auth.dockerRegistryToken ? `--docker-registry-token "${options.auth.dockerRegistryToken}"` : ''} \
    ${
      options.auth.dockerRegistryUsername ? `--docker-registry-username "${options.auth.dockerRegistryUsername}"` : ''
    } \
    --git-server-token "${options.auth.gitServerToken}" \
    --git-server-username "${options.auth.gitServerUsername}" \
    --npm-registry-token "${options.auth.npmRegistryToken}" \
    --git-server-connection-type "${options.gitServerConnectionType}" \
    --skip-docker-registry-login=${options.auth.skipDockerRegistryLogin} \
  `
  // eslint-disable-next-line no-console
  console.log(command)
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
    `skopeo inspect docker://${dockerRegistryAddress}/${dockerRepositoryName}/${imageName}:latest`,
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
      `skopeo inspect docker://${dockerRegistryAddress}/${dockerRepositoryName}/${imageName}:latest`,
    )
    const resultJson = JSON.parse(result.stdout) || {}
    return resultJson.RepoTags?.filter((tag: string) => semver.valid(tag)).filter(Boolean) || []
  } catch (e) {
    if (e.stderr.includes('authentication required')) {
      return []
    } else {
      throw e
    }
  }
}

export const newEnv: NewEnvFunc = () => {
  const cleanups = cleanupAfterEach()
  let dockerRegistryDeployment: Subscription
  let npmRegistryDeployment: Subscription
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
        imageName: 'registry',
        imagePort: 5000,
        isReadyPredicate: url =>
          got.get(url, {
            timeout: 100,
          }),
        singletonStrategy: SingletonStrategy.oneInNamespace,
        namespaceName: 'k8test-ci',
      }),
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
    ])
    dockerRegistryDeployment = deployments[0]
    npmRegistryDeployment = deployments[1]
    cleanups.push(() => Promise.all([dockerRegistryDeployment.unsubscribe(), npmRegistryDeployment.unsubscribe()]))
  })

  return async (repo = {}) => {
    const { repoPath, repoName, repoOrg } = await createRepo(repo, gitServer)

    return async ({ isMasterBuild, isDryRun, runTests }) => {
      const dockerRepositoryName = `repo-${chance()
        .hash()
        .slice(0, 8)}`

      await runCiCli({
        isMasterBuild,
        runTests: Boolean(runTests),
        isDryRun: Boolean(isDryRun),
        dockerRegistryAddress: dockerRegistryDeployment.deployedImageUrl,
        npmRegistryAddress: npmRegistryDeployment.deployedImageUrl,
        gitServerConnectionType: gitServer.getConnectionType(),
        gitServerDomain: gitServer.getDomain(),
        dockerRepositoryName,
        gitOrganizationName: repoOrg,
        gitRepositoryName: repoName,
        rootPath: repoPath,
        auth: {
          npmRegistryToken: 'cm95IHNvbW1lciB3YXMgaGVyZQ==',
          gitServerToken: gitServer.getToken(),
          gitServerUsername: gitServer.getUsername(),
          skipDockerRegistryLogin: true,
          dockerRegistryToken: '',
          dockerRegistryUsername: '',
        },
      })

      const published = await Promise.all(
        repo.packages
          ?.filter(packageInfo => packageInfo.targetType === TargetType.npm)
          ?.map(packageInfo => packageInfo.name)
          .map<Promise<[string, PublishedPackageInfo]>>(async packageName => {
            const [versions, latestVersion, tags, latestTag] = await Promise.all([
              publishedNpmPackageVersions(packageName, npmRegistryDeployment.deployedImageUrl),
              latestNpmPackageVersion(packageName, npmRegistryDeployment.deployedImageUrl),
              publishedDockerImageTags(packageName, dockerRepositoryName, dockerRegistryDeployment.deployedImageUrl),
              latestDockerImageTag(packageName, dockerRepositoryName, dockerRegistryDeployment.deployedImageUrl),
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
