import { randomAppId, SingletoneStrategy } from '../src'
import { cleanupAfterEach, customSubscribe, redisClient, isRedisReadyPredicate } from './utils'

describe('test singletone option', () => {
  let cleanups = cleanupAfterEach()

  describe('all use same singletone option', () => {
    test('endpoint should be different when we do not use singletone option', async () => {
      const appId = randomAppId()

      const subscription1 = await customSubscribe(appId)('redis', {
        containerPortToExpose: 6379,
        singletoneStrategy: SingletoneStrategy.many,
        isReadyPredicate: isRedisReadyPredicate,
      })
      cleanups.push(subscription1.unsubscribe)

      const client1 = redisClient({
        host: subscription1.deployedImageAddress,
        port: subscription1.deployedImagePort,
      })
      cleanups.push(() => client1.disconnect())

      await client1.set('x', '1')

      const subscription2 = await customSubscribe(appId)('redis', {
        containerPortToExpose: 6379,
        singletoneStrategy: SingletoneStrategy.many,
        isReadyPredicate: isRedisReadyPredicate,
      })
      cleanups.push(subscription2.unsubscribe)

      const client2 = redisClient({
        host: subscription2.deployedImageAddress,
        port: subscription2.deployedImagePort,
      })
      cleanups.push(() => client2.disconnect())

      expect(subscription1.deployedImageUrl).not.toEqual(subscription2.deployedImageUrl)
      await expect(client2.get('x')).resolves.not.toEqual('1')
    })

    test('endpoint should be the same when we share instance per app-id', async () => {
      const appId = randomAppId()

      const subscription1 = await customSubscribe(appId)('redis', {
        containerPortToExpose: 6379,
        singletoneStrategy: SingletoneStrategy.appId,
        isReadyPredicate: isRedisReadyPredicate,
      })
      cleanups.push(subscription1.unsubscribe)

      const client1 = redisClient({
        host: subscription1.deployedImageAddress,
        port: subscription1.deployedImagePort,
      })
      cleanups.push(() => client1.disconnect())

      await client1.set('x', '1')

      const subscription2 = await customSubscribe(appId)('redis', {
        containerPortToExpose: 6379,
        singletoneStrategy: SingletoneStrategy.appId,
        isReadyPredicate: isRedisReadyPredicate,
      })

      const client2 = redisClient({
        host: subscription2.deployedImageAddress,
        port: subscription2.deployedImagePort,
      })
      cleanups.push(() => client2.disconnect())

      expect(subscription1.deployedImageUrl).toEqual(subscription2.deployedImageUrl)
      await expect(client2.get('x')).resolves.toEqual('1')
    })

    test('endpoint should be the same when we share instance per namespace', async () => {
      const appId = randomAppId()

      const subscription1 = await customSubscribe(appId)('redis', {
        containerPortToExpose: 6379,
        singletoneStrategy: SingletoneStrategy.namespace,
        isReadyPredicate: isRedisReadyPredicate,
      })
      cleanups.push(subscription1.unsubscribe)

      const client1 = redisClient({
        host: subscription1.deployedImageAddress,
        port: subscription1.deployedImagePort,
      })
      cleanups.push(() => client1.disconnect())

      await client1.set('x', '1')

      const subscription2 = await customSubscribe(appId)('redis', {
        containerPortToExpose: 6379,
        singletoneStrategy: SingletoneStrategy.namespace,
        isReadyPredicate: isRedisReadyPredicate,
      })

      const client2 = redisClient({
        host: subscription2.deployedImageAddress,
        port: subscription2.deployedImagePort,
      })
      cleanups.push(() => client2.disconnect())

      expect(subscription1.deployedImageUrl).toEqual(subscription2.deployedImageUrl)
      await expect(client2.get('x')).resolves.toEqual('1')
    })
  })

  describe('multiple singletone options', () => {
    test('endpoint should be different when we do use different singletone options: none,appId,namespace', async () => {
      const appId = randomAppId()

      const subscription1 = await customSubscribe(appId)('redis', {
        containerPortToExpose: 6379,
        singletoneStrategy: SingletoneStrategy.many,
        isReadyPredicate: isRedisReadyPredicate,
      })
      cleanups.push(subscription1.unsubscribe)

      const client1 = redisClient({
        host: subscription1.deployedImageAddress,
        port: subscription1.deployedImagePort,
      })
      cleanups.push(() => client1.disconnect())

      await client1.set('x', '1')

      const subscription2 = await customSubscribe(appId)('redis', {
        containerPortToExpose: 6379,
        singletoneStrategy: SingletoneStrategy.appId,
        isReadyPredicate: isRedisReadyPredicate,
      })
      cleanups.push(subscription2.unsubscribe)

      const client2 = redisClient({
        host: subscription2.deployedImageAddress,
        port: subscription2.deployedImagePort,
      })
      cleanups.push(() => client2.disconnect())

      await client2.set('y', '2')

      const subscription3 = await customSubscribe(appId)('redis', {
        containerPortToExpose: 6379,
        singletoneStrategy: SingletoneStrategy.namespace,
        isReadyPredicate: isRedisReadyPredicate,
      })
      cleanups.push(subscription3.unsubscribe)

      const client3 = redisClient({
        host: subscription3.deployedImageAddress,
        port: subscription3.deployedImagePort,
      })
      cleanups.push(() => client3.disconnect())

      await client3.set('z', '3')

      expect(subscription1.deployedImageUrl).not.toEqual(subscription2.deployedImageUrl)
      expect(subscription2.deployedImageUrl).not.toEqual(subscription3.deployedImageUrl)
      expect(subscription1.deployedImageUrl).not.toEqual(subscription3.deployedImageUrl)

      await expect(client1.get('y')).resolves.toBeNull()
      await expect(client1.get('z')).resolves.toBeNull()

      await expect(client2.get('x')).resolves.toBeNull()
      await expect(client2.get('z')).resolves.toBeNull()

      await expect(client3.get('x')).resolves.toBeNull()
      await expect(client3.get('y')).resolves.toBeNull()
    })
  })
})
