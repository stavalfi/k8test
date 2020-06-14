import { subscribe, randomAppId } from '../src'
import { cleanupAfterEach, isRedisReadyPredicate, redisClient, deleteAllInternalResources } from './utils'

describe('reach endpoints in the cluster', () => {
  let cleanups = cleanupAfterEach()

  test('endpoint is available while the endpoint has active subscription', async () => {
    const {
      unsubscribe,
      deployedImageAddress,
      deployedImagePort,
      monitoringServiceContainerStdioAttachment,
    } = await subscribe({
      imageName: 'redis',
      containerPortToExpose: 6379,
      appId: randomAppId(),
      isReadyPredicate: isRedisReadyPredicate,
      debugMonitoringService: true,
    })

    cleanups.push(unsubscribe)
    cleanups.push(deleteAllInternalResources)
    cleanups.push(() => monitoringServiceContainerStdioAttachment?.close())

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
