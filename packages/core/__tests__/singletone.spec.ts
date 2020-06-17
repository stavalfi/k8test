import got from 'got'
import { randomAppId, SingletonStrategy, subscribe } from '../src'
import { isServiceReadyPredicate, prepareEachTest, randomNamespaceName } from './utils'

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
          containerOptions: { imagePullPolicy: 'Never' },
          namespaceName,
          appId,
          isReadyPredicate: isServiceReadyPredicate,
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

      await got.post(`${subscription1.deployedImageUrl}/set?x=1`)

      await expect(got.get(`${subscription2.deployedImageUrl}/get?key=x`)).resolves.toEqual('1')
      registerNamespaceRemoval(namespaceName)
    })
    test('subscription-2 is still available after subscription-1 unsubscribes', async () => {
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
          singletonStrategy: SingletonStrategy.manyInAppId,
          containerOptions: { imagePullPolicy: 'Never' },
        }),
        subscribe({
          imageName: 'stavalfi/simple-service',
          containerPortToExpose: 80,
          namespaceName,
          appId,
          isReadyPredicate: isServiceReadyPredicate,
          singletonStrategy: SingletonStrategy.manyInAppId,
          containerOptions: { imagePullPolicy: 'Never' },
        }),
      ])
      cleanups.push(() => subscription2.unsubscribe())

      await subscription1.unsubscribe()

      await expect(got.get(`${subscription2.deployedImageUrl}/is-alive`)).resolves.toEqual('true')
      registerNamespaceRemoval(namespaceName)
    })

    test('endpoint is not available after all unsubscribed', async () => {
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
          singletonStrategy: SingletonStrategy.manyInAppId,
          containerOptions: { imagePullPolicy: 'Never' },
        }),
        subscribe({
          imageName: 'stavalfi/simple-service',
          containerPortToExpose: 80,
          namespaceName,
          appId,
          isReadyPredicate: isServiceReadyPredicate,
          singletonStrategy: SingletonStrategy.manyInAppId,
          containerOptions: { imagePullPolicy: 'Never' },
        }),
      ])

      await subscription1.unsubscribe()
      await subscription2.unsubscribe()

      await expect(got.get(`${subscription2.deployedImageUrl}/is-alive`)).rejects.toThrow('true')
      registerNamespaceRemoval(namespaceName)
    })
  })

  describe('multiple singleton options', () => {
    test('endpoint should be different when we do use different singleton options: none,appId,namespace', async () => {
      const namespaceName = randomNamespaceName()
      await startMonitorNamespace(namespaceName)
      const appId = randomAppId()

      const [subscription1, subscription2, subscription3] = await Promise.all([
        subscribe({
          imageName: 'stavalfi/simple-service',
          containerPortToExpose: 80,
          appId,
          namespaceName,
          singletonStrategy: SingletonStrategy.manyInAppId,
          isReadyPredicate: isServiceReadyPredicate,
          containerOptions: { imagePullPolicy: 'Never' },
        }),
        subscribe({
          imageName: 'stavalfi/simple-service',
          containerPortToExpose: 80,
          appId,
          namespaceName,
          singletonStrategy: SingletonStrategy.manyInAppId,
          isReadyPredicate: isServiceReadyPredicate,
          containerOptions: { imagePullPolicy: 'Never' },
        }),
        subscribe({
          imageName: 'stavalfi/simple-service',
          containerPortToExpose: 80,
          appId,
          namespaceName,
          singletonStrategy: SingletonStrategy.oneInNamespace,
          isReadyPredicate: isServiceReadyPredicate,
          containerOptions: { imagePullPolicy: 'Never' },
        }),
      ])

      cleanups.push(subscription1.unsubscribe)
      cleanups.push(subscription2.unsubscribe)
      cleanups.push(subscription3.unsubscribe)

      await Promise.all([
        got.post(`${subscription1.deployedImageUrl}/set?x=1`),
        got.post(`${subscription2.deployedImageUrl}/set?y=2`),
        got.post(`${subscription3.deployedImageUrl}/set?z=3`),
      ])

      await expect(got.get(`${subscription1.deployedImageUrl}/get?key=y`)).resolves.not.toEqual('2')
      await expect(got.get(`${subscription1.deployedImageUrl}/get?key=z`)).resolves.not.toEqual('3')

      await expect(got.get(`${subscription2.deployedImageUrl}/get?key=x`)).resolves.not.toEqual('1')
      await expect(got.get(`${subscription2.deployedImageUrl}/get?key=z`)).resolves.not.toEqual('3')

      await expect(got.get(`${subscription3.deployedImageUrl}/get?key=x`)).resolves.not.toEqual('1')
      await expect(got.get(`${subscription3.deployedImageUrl}/get?key=y`)).resolves.not.toEqual('2')

      registerNamespaceRemoval(namespaceName)
    })
  })
})
