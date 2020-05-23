import Redis from 'ioredis'
import { Subscription } from 'k8test'
import { isRedisReadyPredicate, subscribe } from './utils'

describe('simple use-case', () => {
  let redis: Redis.Redis
  let exposedRedisInfo: Subscription

  beforeEach(async () => {
    exposedRedisInfo = await subscribe('redis', {
      containerPortToExpose: 6379,
      isReadyPredicate: isRedisReadyPredicate,
    })
    redis = new Redis({
      host: exposedRedisInfo.deployedImageAddress, // this is the minikube cluster address on your machine
      port: exposedRedisInfo.deployedImagePort, // this can be any available port on your machine
    })
  })

  afterEach(async () => {
    await exposedRedisInfo.unsubscribe() // redis will not be reachable after this line
    redis.disconnect()
  })

  test('ensure redis is alive', async () => {
    await expect(redis.ping()).resolves.toEqual('PONG')
  })

  describe('ensure its not the same redis in different tests', () => {
    test('set x', async () => {
      await redis.set('x', 1)
      await expect(redis.get('x')).resolves.toEqual('1')
    })
    test('get x', async () => {
      await expect(redis.get('x')).resolves.toBeNull() // it will be null because we will ask different redis with different data
    })
  })
})
