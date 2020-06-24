import chance from 'chance'
import execa from 'execa'
import got from 'got'
import { attach, ConnectionFrom, createK8sClient, SingletonStrategy } from 'k8s-api'
import { randomAppId, subscribe, SubscribeCreatorOptions } from 'k8test'

export const cliMonitoringPath = require.resolve('k8test-cli-logic/dist/src/index.js')

export const randomNamespaceName = () =>
  `k8test-test-mode-${chance()
    .hash()
    .toLocaleLowerCase()
    .slice(0, 8)}`

export const isServiceReadyPredicate = (url: string, _host: string, _port: number) => {
  return got.get(url, {
    timeout: 100,
  })
}

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

const startMonitorNamespace = (namespaceName: string) =>
  execa.command(`node ${cliMonitoringPath} start-monitoring --local-image --namespace ${namespaceName}`, {
    // eslint-disable-next-line no-process-env
    env: { ...(process.env['DEBUG'] && { DEBUG: process.env['DEBUG'] }) },
    stdio: 'inherit',
  })

const deleteK8testResources = (namespaceName: string) =>
  execa.command(`node ${cliMonitoringPath} delete-k8test-resources --namespace ${namespaceName}`, {
    // eslint-disable-next-line no-process-env
    env: { ...(process.env['DEBUG'] && { DEBUG: process.env['DEBUG'] }) },
    stdio: 'inherit',
  })

const attachContainer = async ({
  appId,
  imageName,
  namespaceName,
  singletonStrategy,
}: {
  namespaceName: string
  appId?: string
  imageName: string
  singletonStrategy: SingletonStrategy
}) => {
  const k8sClient = createK8sClient(ConnectionFrom.outsideCluster)
  return await attach({
    k8sClient,
    singletonStrategy,
    appId,
    imageName,
    namespaceName,
  })
}

const attachMonitoringService = async (namespaceName: string) =>
  attachContainer({
    namespaceName,
    singletonStrategy: SingletonStrategy.oneInNamespace,
    imageName: 'stavalfi/k8test-monitoring',
  })

export function driver() {
  const cleanups = cleanupAfterEach()

  type SubscriptionOptions = SubscribeCreatorOptions & { manualUnsubscribe?: boolean }

  return async function newEnv(subscriptionOptions: SubscriptionOptions[]) {
    const namespaceName = randomNamespaceName()
    const appId = randomAppId()

    await startMonitorNamespace(namespaceName)

    const subscriptions = await Promise.all(
      subscriptionOptions.map(options =>
        subscribe({
          appId,
          namespaceName,
          isReadyPredicate: isServiceReadyPredicate,
          containerOptions: { imagePullPolicy: 'Never' },
          ...options,
        }),
      ),
    )

    const manualUnsubscribes = subscriptionOptions
      .map((options, i) => ({ options, i }))
      .filter(({ options }) => !options.manualUnsubscribe)

    cleanups.push(() => Promise.all(manualUnsubscribes.map(({ i }) => subscriptions[i].unsubscribe())))

    cleanups.push(() => deleteK8testResources(namespaceName))

    return {
      subscriptions,
      attachMonitoringService: async () => {
        const socket = await attachMonitoringService(namespaceName)
        cleanups.push(() => socket.terminate())
      },
      attachContainer: async (imageName: string, singletonStrategy: SingletonStrategy) => {
        const socket = await attachContainer({
          imageName,
          singletonStrategy,
          appId,
          namespaceName,
        })
        cleanups.push(() => socket.terminate())
      },
    }
  }
}
