import got from 'got'
import { randomAppId, SingletonStrategy, subscribe } from '../src'
import { isServiceReadyPredicate, prepareEachTest, randomNamespaceName, redisClient } from './utils'

describe('test singleton option', () => {
  const { cleanups, startMonitorNamespace, registerNamespaceRemoval, attachMonitoringService } = prepareEachTest()

  describe('all use same singleton option', () => {
    test('endpoint should be different when we do not use singleton option', async () => {
      const namespaceName = randomNamespaceName()
      await startMonitorNamespace(namespaceName)
      await attachMonitoringService(namespaceName)
      const appId = randomAppId()

      const [subscription1, subscription2] = await Promise.all([
        subscribe({
          imageName: 'stavalfi/simple-service',
          containerPortToExpose: 80,
          namespaceName,
          appId,
          isReadyPredicate: isServiceReadyPredicate,
          containerOptions: { imagePullPolicy: 'Never' },
        }),
        subscribe({
          imageName: 'stavalfi/simple-service',
          containerPortToExpose: 80,
          namespaceName,
          appId,
          isReadyPredicate: isServiceReadyPredicate,
          containerOptions: { imagePullPolicy: 'Never' },
        }),
      ])
      cleanups.push(subscription1.unsubscribe)
      cleanups.push(subscription2.unsubscribe)

      await got.post(`${subscription1.deployedImageUrl}/set?x=1`)

      await expect(got.get(`${subscription2.deployedImageUrl}/get?key=x`)).resolves.not.toEqual('1')
      registerNamespaceRemoval(namespaceName)
    })

    test('endpoint should be the same when we share instance per app-id', async () => {
      const namespaceName = randomNamespaceName()
      await startMonitorNamespace(namespaceName)
      await attachMonitoringService(namespaceName)
      const appId = randomAppId()

      const [subscription1, subscription2] = await Promise.all([
        subscribe({
          imageName: 'stavalfi/simple-service',
          containerPortToExpose: 80,
          namespaceName,
          appId,
          isReadyPredicate: isServiceReadyPredicate,
          singletonStrategy: SingletonStrategy.oneInAppId,
          containerOptions: { imagePullPolicy: 'Never' },
        }),
        subscribe({
          imageName: 'stavalfi/simple-service',
          containerPortToExpose: 80,
          namespaceName,
          appId,
          isReadyPredicate: isServiceReadyPredicate,
          singletonStrategy: SingletonStrategy.oneInAppId,
          containerOptions: { imagePullPolicy: 'Never' },
        }),
      ])
      cleanups.push(subscription1.unsubscribe)
      cleanups.push(subscription2.unsubscribe)

      await got.post(`${subscription1.deployedImageUrl}/set?x=1`)

      await expect(got.get(`${subscription2.deployedImageUrl}/get?key=x`)).resolves.toEqual('1')
      registerNamespaceRemoval(namespaceName)
    })

    test('endpoint should be the same when we share instance per namespace', async () => {
      const namespaceName = randomNamespaceName()
      await startMonitorNamespace(namespaceName)

      const appId = randomAppId()

      const [subscription1, subscription2] = await Promise.all([
        subscribe({
          imageName: 'stavalfi/simple-service',
          containerPortToExpose: 80,
          namespaceName,
          appId,
          isReadyPredicate: isServiceReadyPredicate,
          singletonStrategy: SingletonStrategy.oneInNamespace,
          containerOptions: { imagePullPolicy: 'Never' },
        }),
        subscribe({
          imageName: 'stavalfi/simple-service',
          containerPortToExpose: 80,
          namespaceName,
          appId,
          isReadyPredicate: isServiceReadyPredicate,
          singletonStrategy: SingletonStrategy.oneInNamespace,
          containerOptions: { imagePullPolicy: 'Never' },
        }),
      ])
      cleanups.push(subscription1.unsubscribe)
      cleanups.push(subscription2.unsubscribe)

      const client1 = redisClient({
        host: subscription1.deployedImageAddress,
        port: subscription1.deployedImagePort,
      })
      cleanups.push(() => client1.disconnect())

      const client2 = redisClient({
        host: subscription2.deployedImageAddress,
        port: subscription2.deployedImagePort,
      })
      cleanups.push(() => client2.disconnect())

      await client1.set('x', '1')

      await expect(client2.get('x')).resolves.toEqual('1')
      registerNamespaceRemoval(namespaceName)
    })
    test('2 subscriptions and the endpoint is still available after unsubscribe', async () => {
      const namespaceName = randomNamespaceName()
      await startMonitorNamespace(namespaceName)
      const appId = randomAppId()

      const subscription1 = await subscribe({
        imageName: 'stavalfi/simple-service',
        containerPortToExpose: 80,
        appId,
        namespaceName,
        singletonStrategy: SingletonStrategy.manyInAppId,
        isReadyPredicate: isServiceReadyPredicate,
        containerOptions: { imagePullPolicy: 'Never' },
      })

      const subscription2 = await subscribe({
        imageName: 'stavalfi/simple-service',
        containerPortToExpose: 80,
        appId,
        namespaceName,
        singletonStrategy: SingletonStrategy.manyInAppId,
        isReadyPredicate: isServiceReadyPredicate,
        containerOptions: { imagePullPolicy: 'Never' },
      })
      cleanups.push(() => subscription2.unsubscribe())

      await subscription1.unsubscribe()

      const redis = redisClient({
        host: subscription1.deployedImageAddress,
        port: subscription1.deployedImagePort,
      })
      cleanups.push(() => redis.disconnect())

      await expect(redis.ping()).resolves.toEqual('PONG')
      registerNamespaceRemoval(namespaceName)
    })

    test('endpoint is not available after all unsubscribed', async () => {
      const namespaceName = randomNamespaceName()
      await startMonitorNamespace(namespaceName)
      const appId = randomAppId()

      const subscription1 = await subscribe({
        imageName: 'stavalfi/simple-service',
        containerPortToExpose: 80,
        appId,
        namespaceName,
        singletonStrategy: SingletonStrategy.manyInAppId,
        isReadyPredicate: isServiceReadyPredicate,
        containerOptions: { imagePullPolicy: 'Never' },
      })

      const subscription2 = await subscribe({
        imageName: 'stavalfi/simple-service',
        containerPortToExpose: 80,
        appId,
        namespaceName,
        singletonStrategy: SingletonStrategy.manyInAppId,
        isReadyPredicate: isServiceReadyPredicate,
        containerOptions: { imagePullPolicy: 'Never' },
      })

      await subscription1.unsubscribe()
      await subscription2.unsubscribe()

      const redis = redisClient({
        host: subscription1.deployedImageAddress,
        port: subscription1.deployedImagePort,
      })
      cleanups.push(() => redis.disconnect())

      await expect(redis.ping()).rejects.toThrow(expect.objectContaining({ name: 'MaxRetriesPerRequestError' }))
      registerNamespaceRemoval(namespaceName)
    })
  })

  describe('multiple singleton options', () => {
    test('endpoint should be different when we do use different singleton options: none,appId,namespace', async () => {
      const namespaceName = randomNamespaceName()
      await startMonitorNamespace(namespaceName)
      const appId = randomAppId()

      const subscription1 = await subscribe({
        imageName: 'stavalfi/simple-service',
        containerPortToExpose: 80,
        appId,
        namespaceName,
        singletonStrategy: SingletonStrategy.manyInAppId,
        isReadyPredicate: isServiceReadyPredicate,
        containerOptions: { imagePullPolicy: 'Never' },
      })
      cleanups.push(subscription1.unsubscribe)

      const client1 = redisClient({
        host: subscription1.deployedImageAddress,
        port: subscription1.deployedImagePort,
      })
      cleanups.push(() => client1.disconnect())

      await client1.set('x', '1')

      const subscription2 = await subscribe({
        imageName: 'stavalfi/simple-service',
        containerPortToExpose: 80,
        appId,
        namespaceName,
        singletonStrategy: SingletonStrategy.manyInAppId,
        isReadyPredicate: isServiceReadyPredicate,
        containerOptions: { imagePullPolicy: 'Never' },
      })
      cleanups.push(subscription2.unsubscribe)

      const client2 = redisClient({
        host: subscription2.deployedImageAddress,
        port: subscription2.deployedImagePort,
      })
      cleanups.push(() => client2.disconnect())

      await client2.set('y', '2')

      const subscription3 = await subscribe({
        imageName: 'stavalfi/simple-service',
        containerPortToExpose: 80,
        appId,
        namespaceName,
        singletonStrategy: SingletonStrategy.oneInNamespace,
        isReadyPredicate: isServiceReadyPredicate,
        containerOptions: { imagePullPolicy: 'Never' },
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
      registerNamespaceRemoval(namespaceName)
    })
  })
})
