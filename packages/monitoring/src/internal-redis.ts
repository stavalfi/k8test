import Redis from 'ioredis'
import {
  internalK8testResourcesAppId,
  K8sClient,
  k8testNamespaceName,
  SingletonStrategy,
  ExposeStrategy,
  subscribeToImage,
} from 'k8s-api'
import Redlock from 'redlock'
import k8testLog from 'k8test-log'

const log = k8testLog('monitoring:internal-redis')

async function waitUntilReady(isReadyPredicate: () => Promise<void>): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await isReadyPredicate()
      return
    } catch (e) {
      await new Promise(res => setTimeout(res, 1000))
    }
  }
}

const isRedisReadyPredicate = (host: string, port: number) => {
  const redis = new Redis({
    host,
    port,
    lazyConnect: true, // because i will try to connect manually in the next line,
    connectTimeout: 1000,
    showFriendlyErrorStack: true,
  })

  return redis.connect().finally(() => {
    try {
      redis.disconnect()
    } catch {
      // ignore error
    }
  })
}

export type Lock = (lockIdentifier: string) => Promise<{ unlock: () => Promise<void> }>

export async function setupInternalRedis(k8sClient: K8sClient): Promise<{ redisClient: Redis.Redis; lock: Lock }> {
  log('setting up redis for k8test internal use inside namespace "%s"', k8testNamespaceName())
  const redisDeployment = await subscribeToImage({
    k8sClient,
    appId: internalK8testResourcesAppId(),
    namespaceName: k8testNamespaceName(),
    imageName: 'redis',
    containerPortToExpose: 6379,
    exposeStrategy: ExposeStrategy.insideCluster,
    singletonStrategy: SingletonStrategy.oneInNamespace,
  })

  const host = redisDeployment.deployedImageAddress
  const port = redisDeployment.deployedImagePort

  await waitUntilReady(() => isRedisReadyPredicate(host, port))
  log('image "%s". is reachable using the url: "%s" from inside the cluster', 'redis', `${host}:${port}`)

  const redisClient = new Redis({ host, port, showFriendlyErrorStack: true })
  const locker = new Redlock([redisClient])
  return {
    redisClient,
    lock: (lockIdentifier: string) => locker.lock(lockIdentifier, 100_000),
  }
}
