import chance from 'chance'
import execa from 'execa'
import fse from 'fs-extra'
import got from 'got'
import Redis from 'ioredis'
import { SingletonStrategy, subscribe, Subscription } from 'k8test'
import path from 'path'
import semver from 'semver'
import { CiOptions } from '../../src/types'
import { getDockerImageLabels } from '../../src/docker-utils'
import { createRepo } from './create-repo'
import { GitServer, starGittServer } from './git-server-testkit'
import {
  NewEnvFunc,
  PublishedPackageInfo,
  RunCi,
  TargetType,
  ToActualName,
  CreateAndManageRepo,
  NpmRegistry,
} from './types'

const ciCliPath = path.join(__dirname, '../../dist/src/index.js')

const runCiCli = async (options: CiOptions) => {
  const command = `\
  ${ciCliPath}\
    --cwd ${options.rootPath} \
    --master-build=${options.isMasterBuild} \
    --dry-run=${options.isDryRun} \
    --skip-tests=${options.skipTests} \
    --docker-registry ${options.dockerRegistryAddress} \
    --npm-registry ${options.npmRegistryAddress} \
    --git-server-domain ${options.gitServerDomain} \
    --docker-repository ${options.dockerOrganizationName} \
    --git-organization ${options.gitOrganizationName} \
    --git-repository ${options.gitRepositoryName} \
    ${options.auth.dockerRegistryToken ? `--docker-registry-token ${options.auth.dockerRegistryToken}` : ''} \
    ${options.auth.dockerRegistryUsername ? `--docker-registry-username ${options.auth.dockerRegistryUsername}` : ''} \
    --git-server-token ${options.auth.gitServerToken} \
    --git-server-username ${options.auth.gitServerUsername} \
    --npm-registry-username ${options.auth.npmRegistryUsername} \
    --npm-registry-email ${options.auth.npmRegistryEmail} \
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
  try {
    const result = await execa.command(`npm view ${packageName} --json --registry ${npmRegistryAddress}`)
    const resultJson = JSON.parse(result.stdout) || {}
    const distTags = resultJson['dist-tags'] as { [key: string]: string }
    return distTags['latest']
  } catch (e) {
    if (e.message.includes('code E404')) {
      return ''
    } else {
      throw e
    }
  }
}

async function publishedNpmPackageVersions(packageName: string, npmRegistryAddress: string): Promise<string[]> {
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

async function latestDockerImageTag(
  imageName: string,
  dockerOrganizationName: string,
  dockerRegistryAddress: string,
): Promise<string> {
  try {
    const result = await getDockerImageLabels({
      dockerOrganizationName,
      dockerRegistryAddress,
      imageName,
      imageTag: 'latest',
    })
    return result.latestTag
  } catch (e) {
    if (e.stderr.includes('authentication required') || e.stderr.includes('manifest unknown')) {
      return ''
    } else {
      throw e
    }
  }
}

async function publishedDockerImageTags(
  imageName: string,
  dockerOrganizationName: string,
  dockerRegistryAddress: string,
): Promise<string[]> {
  try {
    const result = await got.get<string[]>(
      `${dockerRegistryAddress}/v2/repositories/${dockerOrganizationName}/${imageName}/tags`,
      {
        resolveBodyOnly: true,
      },
    )
    return result.filter((tag: string) => semver.valid(tag) || tag === 'latest').filter(Boolean)
  } catch (e) {
    if (e.stderr.includes('authentication required') || e.stderr.includes('manifest unknown')) {
      return []
    } else {
      throw e
    }
  }
}

const isRedisReadyPredicate = (_url: string, host: string, port: number) => {
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

async function commitAllAndPushChanges(repoPath: string, gitRepoAddress: string) {
  await execa.command('git add --all', { cwd: repoPath })
  await execa.command('git commit -m init', { cwd: repoPath })
  await execa.command(`git push ${gitRepoAddress}`, { cwd: repoPath })
}

async function getPackages(rootPath: string): Promise<string[]> {
  const result = await execa.command('yarn workspaces --json info', {
    cwd: rootPath,
  })
  const workspacesInfo: { location: string }[] = JSON.parse(JSON.parse(result.stdout).data)
  return Object.values(workspacesInfo)
    .map(workspaceInfo => workspaceInfo.location)
    .map(relativePackagePath => path.join(rootPath, relativePackagePath))
}

const addRandomFileToPackage = ({
  repoPath,
  toActualName,
  gitRepoAddress,
}: {
  toActualName: ToActualName
  repoPath: string
  gitRepoAddress: string
}) => async (packageName: string): Promise<string> => {
  const packagesPath = await getPackages(repoPath)
  const packagePath = packagesPath.find(path => path.endsWith(toActualName(packageName)))
  if (!packagePath) {
    throw new Error(`package "${packageName}" not found in [${packagesPath.join(', ')}]`)
  }
  const filePath = path.join(repoPath, `random-file-${chance().hash()}`)
  await fse.writeFile(path.join(repoPath, `random-file-${chance().hash()}`), '')

  await commitAllAndPushChanges(repoPath, gitRepoAddress)
  return filePath
}

const installAndRunNpmDependency = async ({
  toActualName,
  createRepo,
  npmRegistry,
  dependencyName,
}: {
  toActualName: ToActualName
  npmRegistry: NpmRegistry
  createRepo: CreateAndManageRepo
  dependencyName: string
}): Promise<execa.ExecaChildProcess<string>> => {
  const { getPackagePath } = await createRepo({
    packages: [
      {
        name: 'b',
        version: '2.0.0',
        targetType: TargetType.none,
        dependencies: {
          [toActualName(dependencyName)]: `http://${npmRegistry.ip}:${npmRegistry.port}/${toActualName(
            dependencyName,
          )}/-/${toActualName(dependencyName)}-1.0.0.tgz`,
        },
        'index.js': `require("${toActualName(dependencyName)}")`,
      },
    ],
  })
  return execa.node(path.join(await getPackagePath('b'), 'index.js'))
}

const addRandomFileToRoot = ({
  repoPath,
  gitRepoAddress,
}: {
  repoPath: string
  gitRepoAddress: string
}) => async (): Promise<string> => {
  const filePath = path.join(repoPath, `random-file-${chance().hash()}`)
  await fse.writeFile(path.join(repoPath, `random-file-${chance().hash()}`), '')

  await commitAllAndPushChanges(repoPath, gitRepoAddress)
  return filePath
}

function prepareTestResources() {
  let dockerRegistry: {
    containerId: string
    port: string
    ip: string
  }
  let npmRegistryDeployment: Subscription
  let redisDeployment: Subscription
  let gitServer: GitServer

  beforeAll(async () => {
    gitServer = await starGittServer()
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
      gitServer.close(),
      npmRegistryDeployment.unsubscribe(),
      execa
        .command(`docker kill ${dockerRegistry.containerId}`)
        .then(() => execa.command(`docker rm ${dockerRegistry.containerId}`)),
    ])
  })

  return {
    get: () => ({
      npmRegistry: {
        ip: npmRegistryDeployment.deployedImageIp,
        port: npmRegistryDeployment.deployedImagePort,
      },
      dockerRegistry: {
        ip: dockerRegistry.ip,
        port: dockerRegistry.port,
      },
      redis: {
        ip: redisDeployment.deployedImageIp,
        port: redisDeployment.deployedImagePort,
      },
      gitServer,
    }),
  }
}

export const newEnv: NewEnvFunc = () => {
  const testResources = prepareTestResources()

  const createAndManageReo: CreateAndManageRepo = async (repo = {}) => {
    const resourcesNamesPostfix = chance()
      .hash()
      .slice(0, 8)

    const toActualName = (name: string) =>
      name.endsWith(`-${resourcesNamesPostfix}`) ? name : `${name}-${resourcesNamesPostfix}`

    const { dockerRegistry, npmRegistry, gitServer, redis } = testResources.get()
    const dockerIpWithPort = `${dockerRegistry.ip}:${dockerRegistry.port}`

    const { repoPath, repoName, repoOrg } = await createRepo({
      repo,
      gitServer,
      toActualName,
    })

    const getPackagePath = async (packageName: string) => {
      const packagesPath = await getPackages(repoPath)
      const packagePath = packagesPath.find(path => path.endsWith(toActualName(packageName)))
      if (!packagePath) {
        throw new Error(
          `bug: could not create repo correctly. missing folder: packages/${toActualName(packageName)} in: ${repoPath}`,
        )
      }
      return packagePath
    }

    const addRandomFileToPackage_ = addRandomFileToPackage({
      repoPath,
      gitRepoAddress: gitServer.generateGitRepositoryAddress(repoOrg, repoName),
      toActualName,
    })

    const addRandomFileToRoot_ = addRandomFileToRoot({
      repoPath,
      gitRepoAddress: gitServer.generateGitRepositoryAddress(repoOrg, repoName),
    })

    const runCi: RunCi = async ({ isMasterBuild, isDryRun, skipTests }) => {
      const dockerOrganizationName = toActualName('repo')

      // verdaccio allow us to login as any user & password & email
      const verdaccioCardentials = {
        npmRegistryUsername: 'root',
        npmRegistryToken: 'root',
        npmRegistryEmail: 'root@root.root',
      }
      await runCiCli({
        isMasterBuild,
        skipTests: Boolean(skipTests),
        isDryRun: Boolean(isDryRun),
        dockerRegistryAddress: dockerIpWithPort,
        npmRegistryAddress: `http://${npmRegistry.ip}:${npmRegistry.port}`,
        gitServerConnectionType: gitServer.getConnectionType(),
        gitServerDomain: gitServer.getDomain(),
        dockerOrganizationName,
        gitOrganizationName: repoOrg,
        gitRepositoryName: repoName,
        rootPath: repoPath,
        redisIp: redis.ip,
        redisPort: redis.port,
        auth: {
          ...verdaccioCardentials,
          gitServerToken: gitServer.getToken(),
          gitServerUsername: gitServer.getUsername(),
        },
      })

      const packages = await Promise.all(
        repo.packages
          ?.filter(packageInfo => packageInfo.targetType === TargetType.npm)
          ?.map(packageInfo => packageInfo.name)
          ?.map<Promise<[string, PublishedPackageInfo]>>(async packageName => {
            const actualName = toActualName(packageName)
            const [versions, latestVersion, tags, latestTag] = await Promise.all([
              publishedNpmPackageVersions(actualName, `http://${npmRegistry.ip}:${npmRegistry.port}`),
              latestNpmPackageVersion(actualName, `http://${npmRegistry.ip}:${npmRegistry.port}`),
              publishedDockerImageTags(actualName, dockerOrganizationName, dockerIpWithPort),
              latestDockerImageTag(actualName, dockerOrganizationName, dockerIpWithPort),
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

      const published = packages.filter(
        ([, packageInfo]) => packageInfo.docker.latestTag || packageInfo.npm.latestVersion,
      )

      return {
        published: new Map(published),
      }
    }

    return {
      repoPath,
      getPackagePath,
      addRandomFileToPackage: addRandomFileToPackage_,
      addRandomFileToRoot: addRandomFileToRoot_,
      npmRegistryAddress: `http://${npmRegistry.ip}:${npmRegistry.port}`,
      runCi,
      installAndRunNpmDependency: (dependencyName: string) =>
        installAndRunNpmDependency({
          createRepo: createAndManageReo,
          npmRegistry: testResources.get().npmRegistry,
          toActualName,
          dependencyName,
        }),
    }
  }

  return {
    createRepo: createAndManageReo,
  }
}
