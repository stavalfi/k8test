import Redis from 'ioredis'
import { ExposeStrategy, K8sClient, SingletonStrategy, subscribeToImage, DeployedImage } from 'k8s-api'
import k8testLog from 'k8test-log'

const log = k8testLog('monitoring:internal-redis')

async function waitUntilReady(isReadyPredicate: () => Promise<unknown>): Promise<void> {
  let i = 0
  // eslint-disable-next-line no-constant-condition
  while (i < 20) {
    try {
      // eslint-disable-next-line no-console
      console.log(`try ${i}`)
      await isReadyPredicate()
      return
    } catch (e) {
      await new Promise(res => setTimeout(res, 1000))
    }
    i++
  }
  throw new Error('fuck')
}

const isRedisReadyPredicate = (host: string, port: number) => {
  const redisClient = new Redis({
    host,
    port,
    lazyConnect: true, // because i will try to connect manually in the next line,
    connectTimeout: 1000,
    showFriendlyErrorStack: true,
  })
  redisClient.on('error', () => {
    // ignore
  })

  return redisClient.connect().finally(() => {
    try {
      redisClient.disconnect()
    } catch {
      // ignore error
    }
  })
}

export async function setupInternalRedis(
  k8sClient: K8sClient,
  namespaceName: string,
): Promise<{
  redisDeployment: DeployedImage
  redisClient: Redis.Redis
}> {
  log('setting up redis for k8test internal use inside namespace "%s"', namespaceName)
  const redisDeployment = await subscribeToImage({
    k8sClient,
    namespaceName,
    imageName: 'redis',
    imagePort: 6379,
    exposeStrategy: ExposeStrategy.insideCluster,
    singletonStrategy: SingletonStrategy.oneInNamespace,
  })

  const host = redisDeployment.deployedImageIp
  const port = redisDeployment.deployedImagePort

  log(
    'waiting until the service in image "%s" is reachable using the address: "%s" from inside the cluster',
    'redis',
    redisDeployment.deployedImageUrl,
  )

  await waitUntilReady(() => isRedisReadyPredicate(host, port))
  log('image "%s". is reachable using the address: "%s" from inside the cluster', 'redis', `${host}:${port}`)

  const redisClient = new Redis({ host, port, showFriendlyErrorStack: true })
  redisClient.on('error', () => {
    // ignore
  })
  return {
    redisClient,
    redisDeployment,
  }
}
