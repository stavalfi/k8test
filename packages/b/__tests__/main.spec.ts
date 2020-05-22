import { subscribe, redisClient, cleanupAfterEach } from './utils'

describe('reach endpoints in the cluster', () => {
  let cleanups = cleanupAfterEach()

  test.only('endpoint is available while the endpoint has active subscription', async () => {
    const { unsubscribe, deployedImageAddress, deployedImagePort } = await subscribe('redis', {
      containerPortToExpose: 6379,
    })
    cleanups.push(unsubscribe)

    const redis = redisClient({
      host: deployedImageAddress,
      port: deployedImagePort,
    })
    cleanups.push(() => redis.disconnect())

    await expect(redis.ping()).resolves.toEqual('PONG')
  })

  test('endpoint is not available after unsbscribe', async () => {
    const { unsubscribe, deployedImageAddress, deployedImagePort } = await subscribe('redis', {
      containerPortToExpose: 6379,
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
