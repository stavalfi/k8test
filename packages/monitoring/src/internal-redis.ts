import Redis from 'ioredis'
import { ExposeStrategy, K8sClient, SingletonStrategy, subscribeToImage, DeployedImage } from 'k8s-api'
import k8testLog from 'k8test-log'
import Redlock from 'redlock'

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
  const redisClient = new Redis({
    host,
    port,
    lazyConnect: true, // because i will try to connect manually in the next line,
    connectTimeout: 1000,
    showFriendlyErrorStack: true,
  })
  redisClient.on('error', () => {})

  return redisClient.connect().finally(() => {
    try {
      redisClient.disconnect()
    } catch {
      // ignore error
    }
  })
}

export type SyncTask = <SyncTaskReturnType>(
  lockIdentifier: string,
  task: () => Promise<SyncTaskReturnType>,
) => Promise<SyncTaskReturnType>

export async function setupInternalRedis(
  k8sClient: K8sClient,
  namespaceName: string,
): Promise<{
  redisDeployment: DeployedImage
  redisClient: Redis.Redis
  syncTask: SyncTask
}> {
  log('setting up redis for k8test internal use inside namespace "%s"', namespaceName)
  const redisDeployment = await subscribeToImage({
    k8sClient,
    namespaceName,
    imageName: 'redis',
    containerPortToExpose: 6379,
    exposeStrategy: ExposeStrategy.insideCluster,
    singletonStrategy: SingletonStrategy.oneInNamespace,
  })

  const host = redisDeployment.deployedImageAddress
  const port = redisDeployment.deployedImagePort

  log(
    'waiting until the service in image "%s" is reachable using the address: "%s" from inside the cluster',
    'redis',
    redisDeployment.deployedImageUrl,
  )

  await waitUntilReady(() => isRedisReadyPredicate(host, port))
  log('image "%s". is reachable using the address: "%s" from inside the cluster', 'redis', `${host}:${port}`)

  const redisClient = new Redis({ host, port, showFriendlyErrorStack: true })
  redisClient.on('error', () => {})
  await redisClient.set('x', 1)
  const locker = new Redlock([redisClient])
  // eslint-disable-next-line no-console
  locker.on('clientError', e => console.error('lock-error', e))
  return {
    redisClient,
    redisDeployment,
    syncTask: async (lockIdentifier, task) => {
      const lock = await locker.lock(lockIdentifier, 10_000)
      const result = await task()
      await lock.unlock()
      return result
    },
  }
}
