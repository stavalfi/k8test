import Redis from 'ioredis'
import { subscribe, Subscription, SingletonStrategy } from 'k8test'
import { isRedisReadyPredicate } from './utils'

describe('simple use-case', () => {
  let redis: Redis.Redis
  let exposedRedisInfo: Subscription

  beforeEach(async () => {
    exposedRedisInfo = await subscribe({
      imageName: 'redis',
      containerPortToExpose: 6379,
      isReadyPredicate: isRedisReadyPredicate,
      singletonStrategy: SingletonStrategy.manyInAppId,
      ttlMs: 100_000_000,
    })

    redis = new Redis({
      host: exposedRedisInfo.deployedImageAddress, // this is the minikube cluster address on your machine
      port: exposedRedisInfo.deployedImagePort, // this can be any available port on your machine
      connectTimeout: 1000,
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
