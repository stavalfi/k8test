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
import {
  addRandomFileToPackage,
  addRandomFileToRoot,
  installAndRunNpmDependency,
  publishNpmPackageWithoutCi,
  unpublishNpmPackage,
  removeAllNpmHashTags,
  modifyPackageJson,
} from './test-helpers'
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

    const { dockerRegistry, npmRegistry, gitServer, redisServer } = testResources.get()

    const { repoPath, repoName, repoOrg } = await createRepo({
      repo,
      gitServer,
      toActualName,
    })

    const runCi: RunCi = async ({ isMasterBuild, isDryRun, skipTests, stdio }) => {
      await runCiCli(
        {
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
            host: redisServer.host,
            port: redisServer.port,
          },
          auth: {
            ...npmRegistry.auth,
            gitServerToken: gitServer.getToken(),
            gitServerUsername: gitServer.getUsername(),
          },
        },
        stdio,
      )

      const packages = await Promise.all(
        repo.packages
          ?.map(packageInfo => packageInfo.name)
          ?.map<Promise<[string, PublishedPackageInfo]>>(async packageName => {
            const actualName = toActualName(packageName)
            const [versions, latestVersion, tags, latestTag] = await Promise.all([
              publishedNpmPackageVersions(actualName, npmRegistry),
              latestNpmPackageVersion(actualName, npmRegistry),
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
      addRandomFileToRoot: () =>
        addRandomFileToRoot({
          repoPath,
          gitRepoAddress: gitServer.generateGitRepositoryAddress(repoOrg, repoName),
        }),
      npmRegistryAddress: `${npmRegistry.protocol}://${npmRegistry.host}:${npmRegistry.port}`,
      runCi,
      dockerOrganizationName,
      installAndRunNpmDependency: dependencyName =>
        installAndRunNpmDependency({
          createRepo: createAndManageReo,
          npmRegistry: testResources.get().npmRegistry,
          toActualName,
          dependencyName,
        }),
      publishNpmPackageWithoutCi: packageName =>
        publishNpmPackageWithoutCi({
          npmRegistry,
          npmRegistryEmail: npmRegistry.auth.npmRegistryEmail,
          npmRegistryToken: npmRegistry.auth.npmRegistryToken,
          npmRegistryUsername: npmRegistry.auth.npmRegistryUsername,
          packageName,
          repoPath,
          toActualName,
        }),
      unpublishNpmPackage: (packageName, versionToUnpublish) =>
        unpublishNpmPackage({
          npmRegistry,
          npmRegistryEmail: npmRegistry.auth.npmRegistryEmail,
          npmRegistryToken: npmRegistry.auth.npmRegistryToken,
          npmRegistryUsername: npmRegistry.auth.npmRegistryUsername,
          packageName,
          versionToUnpublish,
          toActualName,
        }),
      removeAllNpmHashTags: packageName =>
        removeAllNpmHashTags({
          npmRegistry,
          npmRegistryEmail: npmRegistry.auth.npmRegistryEmail,
          npmRegistryToken: npmRegistry.auth.npmRegistryToken,
          npmRegistryUsername: npmRegistry.auth.npmRegistryUsername,
          packageName,
          repoPath,
          toActualName,
        }),
      modifyPackageJson: (packageName, modification) =>
        modifyPackageJson({
          repoPath,
          gitRepoAddress: gitServer.generateGitRepositoryAddress(repoOrg, repoName),
          toActualName,
          packageName,
          modification,
        }),
    }
  }

  return {
    createRepo: createAndManageReo,
    getTestResources: () => {
      const { dockerRegistry, gitServer, npmRegistry, redisServer } = testResources.get()
      return {
        dockerRegistry,
        gitServer: gitServer.getServerInfo(),
        npmRegistry,
        redisServer,
      }
    },
  }
}
