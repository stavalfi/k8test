import got from 'got'
import { driver } from './utils'

describe('reach endpoints in the cluster', () => {
  const newEnv = driver()

  test('endpoint is available while the endpoint has active subscription', async () => {
    const {
      subscriptions: [subscription1],
    } = await newEnv([
      {
        imageName: 'stavalfi/simple-service',
        imagePort: 80,
      },
    ])

    await expect(got.get(`${subscription1.deployedImageUrl}/is-alive`, { resolveBodyOnly: true })).resolves.toEqual(
      'true',
    )
  })

  test('endpoint is not available after unsubscribe', async () => {
    const {
      subscriptions: [subscription1],
    } = await newEnv([
      {
        imageName: 'stavalfi/simple-service',
        imagePort: 80,
        manualUnsubscribe: true,
      },
    ])

    await subscription1.unsubscribe()

    await expect(got.get(`${subscription1.deployedImageUrl}/is-alive`, { timeout: 50 })).rejects.toThrow(
      expect.objectContaining({ name: expect.stringMatching(/TimeoutError|RequestError/) }),
    )
  })
})
