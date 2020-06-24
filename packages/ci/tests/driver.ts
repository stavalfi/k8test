import { NewEnvFunc, Resource, RunCi, Repo } from './types'
import { subscribe, Subscription, SubscribeCreatorOptions, SingletonStrategy } from 'k8test'
import got from 'got'
import execa from 'execa'
import { ciOptions } from '../src/ci-logic'
import { gitServer } from './git-server-testkit'
import { TargetType } from 'ci/dist/src/types'

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

const subscribeOptionsByImage: { [image: string]: SubscribeCreatorOptions } = {
  [Resource.npmRegistry]: {
    imageName: 'verdaccio/verdaccio',
    imagePort: 4873,
    isReadyPredicate: url =>
      got.get(url, {
        timeout: 100,
      }),
  },
}

const ciCliPath = require.resolve('../dist/src/index.js')

const runCiCli = async (options: ciOptions) =>
  execa.command(`\
${ciCliPath}\
  --cwd ${options.rootPath} \
  --master-build ${options.isMasterBuild} \
  --dry-run ${options.isDryRun} \
  --run-tests ${options.runTests} \
  --docker-registry ${options.dockerRegistryAddress} \
  --npm-registry ${options.npmRegistryAddress} \
  --git-server-domain ${options.gitServerDomain} \
  --docker-repository ${options.dockerRepositoryName} \
  --git-organization ${options.gitOrganizationName} \
  --git-repository${options.gitRepositoryName} \
  --docker-registry-token ${options.auth.dockerRegistryToken} \
  --docker-registry-username ${options.auth.dockerRegistryUsername} \
  --git-server-token ${options.auth.gitServerToken} \
  --git-server-username ${options.auth.gitServerUsername} \
  --npm-registry-token ${options.auth.npmRegistryToken} \
  --git-server-connection-type ${options.gitServerConnectionType} \
`)

const runCi: RunCi = async ({
  isMasterBuild,
  isDryRun,
  runTests,
  dockerRegistryDeployment,
  gitServerDomain,
  npmRegistryDeployment,
}) => {
  await runCiCli({
    isMasterBuild,
    runTests: Boolean(runTests),
    isDryRun: Boolean(isDryRun),
    dockerRegistryAddress: dockerRegistryDeployment.deployedImageUrl,
    npmRegistryAddress: npmRegistryDeployment.deployedImageUrl,
    gitServerConnectionType: '',
    gitServerDomain,
    dockerRepositoryName: '',
    gitOrganizationName: '',
    gitRepositoryName: '',
    rootPath: '',
    auth: {
      dockerRegistryToken: '',
      dockerRegistryUsername: '',
      gitServerToken: '',
      gitServerUsername: '',
      npmRegistryToken: '',
    },
  })

  return {
    published: {},
  }
}

export const newEnv: NewEnvFunc = async () => {
  const cleanups = cleanupAfterEach()
  let dockerRegistryDeployment: Subscription
  let npmRegistryDeployment: Subscription

  beforeAll(async () => {
    const deployments = await Promise.all([
      subscribe({
        ...subscribeOptionsByImage[TargetType.docker],
        singletonStrategy: SingletonStrategy.oneInAppId,
        namespaceName: 'ci-namespace',
      }),
      subscribe({
        ...subscribeOptionsByImage[TargetType.npm],
        singletonStrategy: SingletonStrategy.oneInAppId,
        namespaceName: 'ci-namespace',
      }),
    ])
    dockerRegistryDeployment = deployments[0]
    npmRegistryDeployment = deployments[1]
    cleanups.push(() => Promise.all([dockerRegistryDeployment.unsubscribe(), npmRegistryDeployment.unsubscribe()]))
  })

  return options => runCi({ ...options, dockerRegistryDeployment, npmRegistryDeployment })
}
