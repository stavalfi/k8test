import got from 'got'
import { SingletonStrategy } from 'k8test'
import { driver } from './utils'

describe('test singleton option', () => {
  const newEnv = driver()

  describe('all use same singleton option', () => {
    test('endpoint should be different when we do not use singleton option', async () => {
      const {
        subscriptions: [subscription1, subscription2],
      } = await newEnv([
        {
          imageName: 'stavalfi/simple-service',
          imagePort: 80,
        },
        {
          imageName: 'stavalfi/simple-service',
          imagePort: 80,
        },
      ])

      await got.post(`${subscription1.deployedImageUrl}/set?x=1`)

      await expect(got.get(`${subscription2.deployedImageUrl}/get/x`, { resolveBodyOnly: true })).resolves.not.toEqual(
        '1',
      )
    })

    test('endpoint should be the same when we share instance per app-id', async () => {
      const {
        subscriptions: [subscription1, subscription2],
      } = await newEnv([
        {
          imageName: 'stavalfi/simple-service',
          imagePort: 80,
          singletonStrategy: SingletonStrategy.oneInAppId,
        },
        {
          imageName: 'stavalfi/simple-service',
          imagePort: 80,
          singletonStrategy: SingletonStrategy.oneInAppId,
        },
      ])

      await got.post(`${subscription1.deployedImageUrl}/set?x=1`)

      await expect(got.get(`${subscription2.deployedImageUrl}/get/x`, { resolveBodyOnly: true })).resolves.toEqual('1')
    })

    test('endpoint should be the same when we share instance per namespace', async () => {
      const {
        subscriptions: [subscription1, subscription2],
      } = await newEnv([
        {
          imageName: 'stavalfi/simple-service',
          imagePort: 80,
          singletonStrategy: SingletonStrategy.oneInNamespace,
        },
        {
          imageName: 'stavalfi/simple-service',
          imagePort: 80,
          singletonStrategy: SingletonStrategy.oneInNamespace,
        },
      ])

      await got.post(`${subscription1.deployedImageUrl}/set?x=1`)

      await expect(got.get(`${subscription2.deployedImageUrl}/get/x`, { resolveBodyOnly: true })).resolves.toEqual('1')
    })
    test('subscription-2 is still available after subscription-1 unsubscribes', async () => {
      const {
        subscriptions: [subscription1, subscription2],
      } = await newEnv([
        {
          imageName: 'stavalfi/simple-service',
          imagePort: 80,
          singletonStrategy: SingletonStrategy.manyInAppId,
          manualUnsubscribe: true,
        },
        {
          imageName: 'stavalfi/simple-service',
          imagePort: 80,
          singletonStrategy: SingletonStrategy.manyInAppId,
        },
      ])

      await subscription1.unsubscribe()

      await expect(got.get(`${subscription2.deployedImageUrl}/is-alive`, { resolveBodyOnly: true })).resolves.toEqual(
        'true',
      )
    })

    test('endpoint is not available after all unsubscribed', async () => {
      const {
        subscriptions: [subscription1, subscription2],
      } = await newEnv([
        {
          imageName: 'stavalfi/simple-service',
          imagePort: 80,
          singletonStrategy: SingletonStrategy.manyInAppId,
          manualUnsubscribe: true,
        },
        {
          imageName: 'stavalfi/simple-service',
          imagePort: 80,
          singletonStrategy: SingletonStrategy.manyInAppId,
          manualUnsubscribe: true,
        },
      ])

      await Promise.all([subscription1.unsubscribe(), subscription2.unsubscribe()])

      await expect(got.get(`${subscription2.deployedImageUrl}/is-alive`, { timeout: 50 })).rejects.toThrow(
        expect.objectContaining({ name: expect.stringMatching(/TimeoutError|RequestError/) }),
      )
    })
  })

  describe('multiple singleton options', () => {
    test('endpoint should be different when we do use different singleton options: none,appId,namespace', async () => {
      const {
        subscriptions: [subscription1, subscription2, subscription3],
      } = await newEnv([
        {
          imageName: 'stavalfi/simple-service',
          imagePort: 80,
          singletonStrategy: SingletonStrategy.manyInAppId,
        },
        {
          imageName: 'stavalfi/simple-service',
          imagePort: 80,
          singletonStrategy: SingletonStrategy.oneInAppId,
        },
        {
          imageName: 'stavalfi/simple-service',
          imagePort: 80,
          singletonStrategy: SingletonStrategy.oneInNamespace,
        },
      ])

      await Promise.all([
        got.post(`${subscription1.deployedImageUrl}/set?x=1`),
        got.post(`${subscription2.deployedImageUrl}/set?y=2`),
        got.post(`${subscription3.deployedImageUrl}/set?z=3`),
      ])

      await expect(got.get(`${subscription1.deployedImageUrl}/get/y`, { resolveBodyOnly: true })).resolves.not.toEqual(
        '2',
      )
      await expect(got.get(`${subscription1.deployedImageUrl}/get/z`, { resolveBodyOnly: true })).resolves.not.toEqual(
        '3',
      )

      await expect(got.get(`${subscription2.deployedImageUrl}/get/x`, { resolveBodyOnly: true })).resolves.not.toEqual(
        '1',
      )
      await expect(got.get(`${subscription2.deployedImageUrl}/get/z`, { resolveBodyOnly: true })).resolves.not.toEqual(
        '3',
      )

      await expect(got.get(`${subscription3.deployedImageUrl}/get/x`, { resolveBodyOnly: true })).resolves.not.toEqual(
        '1',
      )
      await expect(got.get(`${subscription3.deployedImageUrl}/get/y`, { resolveBodyOnly: true })).resolves.not.toEqual(
        '2',
      )
    })
  })
})
