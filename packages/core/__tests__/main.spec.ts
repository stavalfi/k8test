import { subscribe, NamespaceStrategy, randomAppId } from '../src'
import { cleanupAfterEach, isRedisReadyPredicate, redisClient } from './utils'

describe('reach endpoints in the cluster', () => {
  let cleanups = cleanupAfterEach()

  test('endpoint is available while the endpoint has active subscription', async () => {
    const { unsubscribe, deployedImageAddress, deployedImagePort } = await subscribe({
      imageName: 'redis',
      containerPortToExpose: 6379,
      appId: randomAppId(),
      namespace: {
        namespaceStrategy: NamespaceStrategy.k8test,
      },
      isReadyPredicate: isRedisReadyPredicate,
    })

    cleanups.push(unsubscribe)

    const redis = redisClient({
      host: deployedImageAddress,
      port: deployedImagePort,
    })
    cleanups.push(() => redis.disconnect())

    await expect(redis.ping()).resolves.toEqual('PONG')
  })

  test('endpoint is not available after unsubscribe', async () => {
    const { unsubscribe, deployedImageAddress, deployedImagePort } = await subscribe({
      imageName: 'redis',
      containerPortToExpose: 6379,
      appId: randomAppId(),
      namespace: {
        namespaceStrategy: NamespaceStrategy.k8test,
      },
      isReadyPredicate: isRedisReadyPredicate,
    })

    const redis = redisClient({
      host: deployedImageAddress,
      port: deployedImagePort,
    })
    cleanups.push(() => redis.disconnect())

    await unsubscribe()

    await expect(redis.ping()).rejects.toThrow(expect.objectContaining({ name: 'MaxRetriesPerRequestError' }))
  })
})
