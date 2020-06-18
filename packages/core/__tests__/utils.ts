import chance from 'chance'
import execa from 'execa'
import got from 'got'
import { attach, ConnectionFrom, createK8sClient, SingletonStrategy } from 'k8s-api'

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

export function cleanupAfterEach() {
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

export function prepareEachTest() {
  const cleanups = cleanupAfterEach()

  return {
    cleanups,
    startMonitorNamespace: (namespaceName: string) =>
      execa.command(`node ${cliMonitoringPath} start-monitoring --local-image --namespace ${namespaceName}`, {
        // eslint-disable-next-line no-process-env
        env: { ...(process.env['DEBUG'] && { DEBUG: process.env['DEBUG'] }) },
        stdio: 'inherit',
      }),
    registerNamespaceRemoval: (namespaceName: string) =>
      cleanups.push(() =>
        execa.command(`node ${cliMonitoringPath} delete-monitoring --namespace ${namespaceName}`, {
          // eslint-disable-next-line no-process-env
          env: { ...(process.env['DEBUG'] && { DEBUG: process.env['DEBUG'] }) },
          stdio: 'inherit',
        }),
      ),
    attachMonitoringService: async (namespaceName: string) => {
      const k8sClient = createK8sClient(ConnectionFrom.outsideCluster)
      const socket = await attach({
        k8sClient,
        namespaceName,
        singletonStrategy: SingletonStrategy.oneInNamespace,
        imageName: 'stavalfi/k8test-monitoring',
      })
      cleanups.push(() => socket.terminate())
    },
    attachContainer: async ({
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
      const socket = await attach({
        k8sClient,
        singletonStrategy,
        appId,
        imageName,
        namespaceName,
      })
      cleanups.push(() => socket.terminate())
    },
  }
}
