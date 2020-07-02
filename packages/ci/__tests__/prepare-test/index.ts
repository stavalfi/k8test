import chance from 'chance'
import { createRepo } from './create-repo'
import { prepareTestResources } from './prepare-test-resources'
import { runCiCli } from './run-ci-cli'
import {
  latestDockerImageTag,
  latestNpmPackageVersion,
  publishedDockerImageTags,
  publishedNpmPackageVersions,
} from './seach-targets'
import { addRandomFileToPackage, addRandomFileToRoot, installAndRunNpmDependency } from './test-helpers'
import { CreateAndManageRepo, NewEnvFunc, PublishedPackageInfo, RunCi } from './types'
import { getPackagePath } from './utils'

export { runDockerImage } from './test-helpers'

export const newEnv: NewEnvFunc = () => {
  const testResources = prepareTestResources()

  const createAndManageReo: CreateAndManageRepo = async (repo = {}) => {
    const resourcesNamesPostfix = chance()
      .hash()
      .slice(0, 8)

    const toActualName = (name: string) =>
      name.endsWith(`-${resourcesNamesPostfix}`) ? name : `${name}-${resourcesNamesPostfix}`

    const dockerOrganizationName = toActualName('repo')

    const { dockerRegistry, npmRegistry, gitServer, redis } = testResources.get()

    const { repoPath, repoName, repoOrg } = await createRepo({
      repo,
      gitServer,
      toActualName,
    })

    const runCi: RunCi = async ({ isMasterBuild, isDryRun, skipTests }) => {
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
        dockerOrganizationName,
        gitOrganizationName: repoOrg,
        gitRepositoryName: repoName,
        rootPath: repoPath,
        dockerRegistry,
        gitServer: gitServer.getServerInfo(),
        npmRegistry,
        redisServer: {
          host: redis.host,
          port: redis.port,
        },
        auth: {
          ...verdaccioCardentials,
          gitServerToken: gitServer.getToken(),
          gitServerUsername: gitServer.getUsername(),
        },
      })

      await new Promise(res => setTimeout(res, 5000))

      const packages = await Promise.all(
        repo.packages
          ?.map(packageInfo => packageInfo.name)
          ?.map<Promise<[string, PublishedPackageInfo]>>(async packageName => {
            const actualName = toActualName(packageName)
            const [versions, latestVersion, tags, latestTag] = await Promise.all([
              publishedNpmPackageVersions(
                actualName,
                `${npmRegistry.protocol}://${npmRegistry.host}:${npmRegistry.port}`,
              ),
              latestNpmPackageVersion(actualName, `${npmRegistry.protocol}://${npmRegistry.host}:${npmRegistry.port}`),
              publishedDockerImageTags(actualName, dockerOrganizationName, dockerRegistry),
              latestDockerImageTag(actualName, dockerOrganizationName, dockerRegistry),
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

      await new Promise(res => setTimeout(res, 5000))

      const published = packages.filter(
        ([, packageInfo]) => packageInfo.docker.latestTag || packageInfo.npm.latestVersion,
      )

      return {
        published: new Map(published),
      }
    }

    return {
      repoPath,
      toActualName,
      getPackagePath: getPackagePath(repoPath, toActualName),
      addRandomFileToPackage: addRandomFileToPackage({
        repoPath,
        gitRepoAddress: gitServer.generateGitRepositoryAddress(repoOrg, repoName),
        toActualName,
      }),
      addRandomFileToRoot: addRandomFileToRoot({
        repoPath,
        gitRepoAddress: gitServer.generateGitRepositoryAddress(repoOrg, repoName),
      }),
      npmRegistryAddress: `${npmRegistry.protocol}://${npmRegistry.host}:${npmRegistry.port}`,
      runCi,
      dockerRegistry,
      dockerOrganizationName,
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
