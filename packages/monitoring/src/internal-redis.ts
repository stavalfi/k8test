import Redis from 'ioredis'
import {
  ExposeStrategy,
  internalK8testResourcesAppId,
  K8sClient,
  k8testNamespaceName,
  SingletonStrategy,
  subscribeToImage,
} from 'k8s-api'
import Redlock from 'redlock'

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

const isRedisReadyPredicate = (url: string, host: string, port: number) => {
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

export type Lock = (lockIdentifier: string) => Promise<{ unlock: () => Promise<void> }>

export async function setupInternalRedis(k8sClient: K8sClient): Promise<{ redisClient: Redis.Redis; lock: Lock }> {
  const deployedImage = await subscribeToImage({
    k8sClient,
    appId: internalK8testResourcesAppId(),
    namespaceName: k8testNamespaceName(),
    imageName: 'redis',
    containerPortToExpose: 4873,
    exposeStrategy: ExposeStrategy.insideCluster,
    singletonStrategy: SingletonStrategy.oneInCluster,
  })

  await waitUntilReady(() =>
    isRedisReadyPredicate(
      deployedImage.deployedImageUrl,
      deployedImage.deployedImageAddress,
      deployedImage.deployedImagePort,
    ),
  )

  const redisClient = new Redis({ host: deployedImage.deployedImageAddress, port: deployedImage.deployedImagePort })
  const locker = new Redlock([redisClient])
  return {
    redisClient,
    lock: (lockIdentifier: string) => locker.lock(lockIdentifier, 100_000),
  }
}
