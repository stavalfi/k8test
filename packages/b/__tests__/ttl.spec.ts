import { baseSubscribe, randomAppId, Subscribe } from 'b/src'
import { cleanupAfterEach, redisClient } from './utils'

describe('test ttl option', () => {
  let cleanups = cleanupAfterEach()

  test('endpoint should not be available after ttl is reached', async () => {
    const ttlMs = 2000
    const delay = 1000

    const subscribe: Subscribe = (imageName, options) =>
      baseSubscribe({
        ...options,
        imageName,
        appId: randomAppId(),
        ttlMs,
      })

    const { unsubscribe, getDeployedImageAddress, getDeployedImagePort } = await subscribe('redis', {
      containerPortToExpose: 6379,
    })
    cleanups.push(unsubscribe)

    const redis = redisClient({
      host: await getDeployedImageAddress(),
      port: await getDeployedImagePort(),
    })
    cleanups.push(() => redis.disconnect())

    await new Promise(res => setTimeout(res, ttlMs + delay))

    await expect(redis.ping()).rejects.toThrow(expect.objectContaining({ name: 'MaxRetriesPerRequestError' }))
  })
})
