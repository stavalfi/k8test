import Redis from 'ioredis'
import {
  generateResourceName,
  k8testNamespaceName,
  SingletonStrategy,
  unsubscribeFromImage,
  createK8sClient,
  ConnectionFrom,
} from 'k8s-api'

export async function deleteAllInternalResources() {
  const getName = (imageName: string) =>
    generateResourceName({
      imageName,
      namespaceName: k8testNamespaceName(),
      singletonStrategy: SingletonStrategy.oneInNamespace,
    })
  const k8sClient = createK8sClient(ConnectionFrom.outsideCluster)
  await unsubscribeFromImage({
    k8sClient,
    imageName: 'redis',
    namespaceName: k8testNamespaceName(),
    singletonStrategy: SingletonStrategy.oneInNamespace,
    deploymentName: getName('redis'),
    serviceName: getName('redis'),
    forceDelete: true,
  })
  await unsubscribeFromImage({
    k8sClient,
    imageName: 'stavalfi/k8test-monitoring',
    namespaceName: k8testNamespaceName(),
    singletonStrategy: SingletonStrategy.oneInNamespace,
    deploymentName: getName('stavalfi/k8test-monitoring'),
    serviceName: getName('stavalfi/k8test-monitoring'),
    forceDelete: true,
  })
}

export const isRedisReadyPredicate = (url: string, host: string, port: number) => {
  const redis = new Redis({
    host,
    port,
    lazyConnect: true, // because i will try to connect manually in the next line,
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
export function redisClient(options: Redis.RedisOptions) {
  const redis = new Redis({
    maxRetriesPerRequest: 1,
    connectTimeout: 1000,
    ...options,
  })
  return redis
}

export function cleanupAfterEach() {
  const cleanups: (() => Promise<void> | void)[] = []

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
