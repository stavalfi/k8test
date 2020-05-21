import { subscribe, redisClient, cleanupAfterEach } from './utils'

describe('reach endpoints in the cluster', () => {
  let cleanups = cleanupAfterEach()

  test('endpoint is available while the endpoint has active subscription', async () => {
    const { unsubscribe, getDeployedImageAddress, getDeployedImagePort } = await subscribe('redis', {
      containerPortToExpose: 6379,
    })
    cleanups.push(unsubscribe)

    const redis = redisClient({
      host: await getDeployedImageAddress(),
      port: await getDeployedImagePort(),
    })
    cleanups.push(() => redis.disconnect())

    await expect(redis.ping()).resolves.toEqual('PONG')
  })

  test('endpoint is not available after unsbscribe', async () => {
    const { unsubscribe, getDeployedImageAddress, getDeployedImagePort } = await subscribe('redis', {
      containerPortToExpose: 6379,
    })

    const redis = redisClient({
      host: await getDeployedImageAddress(),
      port: await getDeployedImagePort(),
    })
    cleanups.push(() => redis.disconnect())

    await unsubscribe()

    await expect(redis.ping()).rejects.toThrow(expect.objectContaining({ name: 'MaxRetriesPerRequestError' }))
  })
})
