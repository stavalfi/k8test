import { randomAppId, subscribe } from '../src'
import { isRedisReadyPredicate, prepareEachTest, redisClient } from './utils'

describe('reach endpoints in the cluster', () => {
  const { cleanups, randomNamespaceName, startMonitorNamespace, registerNamespaceRemoval } = prepareEachTest()

  test.only('endpoint is available while the endpoint has active subscription', async () => {
    const namespaceName = randomNamespaceName()
    await startMonitorNamespace(namespaceName)

    const { unsubscribe, deployedImageAddress, deployedImagePort } = await subscribe({
      imageName: 'redis',
      containerPortToExpose: 6379,
      namespaceName,
      appId: randomAppId(),
      isReadyPredicate: isRedisReadyPredicate,
    })

    cleanups.push(unsubscribe)
    registerNamespaceRemoval(namespaceName)

    const redis = redisClient({
      host: deployedImageAddress,
      port: deployedImagePort,
    })
    cleanups.push(() => redis.disconnect())

    await expect(redis.ping()).resolves.toEqual('PONG')
  })

  test('endpoint is not available after unsubscribe', async () => {
    const namespaceName = randomNamespaceName()
    await startMonitorNamespace(namespaceName)
    registerNamespaceRemoval(namespaceName)

    const { unsubscribe, deployedImageAddress, deployedImagePort } = await subscribe({
      imageName: 'redis',
      containerPortToExpose: 6379,
      appId: randomAppId(),
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
