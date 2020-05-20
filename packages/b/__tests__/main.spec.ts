import got from 'got'
import { subscribe } from './utils'

describe('reach endpoints in the cluster', () => {
  test('endpoint is only available while the endpoint has active subscription', async () => {
    const { unsubscribe, exposedUrl } = await subscribe('redis', {
      containerPortToExpose: 6379,
    })

    await expect(got.get(exposedUrl)).resolves.toContainEqual(
      expect.objectContaining({
        statusCode: 200,
      }),
    )

    await unsubscribe()

    await expect(got.get(exposedUrl)).rejects.toContainEqual(
      expect.objectContaining({
        statusCode: 404,
      }),
    )
  })
})
