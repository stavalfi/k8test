import { randomAppId, subscribe } from '../src'
import { cleanupAfterEach, isRedisReadyPredicate, redisClient } from './utils'

describe('test ttl option', () => {
  let cleanups = cleanupAfterEach()

  test.skip('endpoint should not be available after ttl is reached', async () => {
    const ttlMs = 2000
    const delay = 1000

    const { unsubscribe, deployedImageAddress, deployedImagePort } = await subscribe({
      imageName: 'redis',
      containerPortToExpose: 6379,
      appId: randomAppId(),
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
