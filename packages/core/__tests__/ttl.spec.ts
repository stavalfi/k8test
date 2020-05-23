import { baseSubscribe, randomAppId, Subscribe } from '../src'
import { cleanupAfterEach, redisClient, isRedisReadyPredicate } from './utils'

describe('test ttl option', () => {
  let cleanups = cleanupAfterEach()

  test.skip('endpoint should not be available after ttl is reached', async () => {
    const ttlMs = 2000
    const delay = 1000

    const subscribe: Subscribe = (imageName, options) =>
      baseSubscribe({
        ...options,
        imageName,
        appId: randomAppId(),
        ttlMs,
      })

    const { unsubscribe, deployedImageAddress, deployedImagePort } = await subscribe('redis', {
      containerPortToExpose: 6379,
      isReadyPredicate: isRedisReadyPredicate,
    })
    cleanups.push(unsubscribe)

    const redis = redisClient({
      host: deployedImageAddress,
      port: deployedImagePort,
    })
    cleanups.push(() => redis.disconnect())

    await new Promise(res => setTimeout(res, ttlMs + delay))

    await expect(redis.ping()).rejects.toThrow(expect.objectContaining({ name: 'MaxRetriesPerRequestError' }))
  })
})
