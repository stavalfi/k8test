import got from 'got'
import { baseSubscribe, randomAppId, Subscribe } from 'b/src'

describe('test ttl option', () => {
  test('endpoint should not be available after ttl is reached', async () => {
    const ttlMs = 2000
    const delay = 1000

    const subscribe: Subscribe = (image, options) =>
      baseSubscribe({
        ...options,
        image,
        appId: randomAppId(),
        ttlMs,
      })

    const { exposedUrl } = await subscribe('redis', {
      containerPortToExpose: 6379,
    })

    await expect(got.get(exposedUrl)).resolves.toContainEqual(
      expect.objectContaining({
        statusCode: 200,
      }),
    )

    await new Promise(res => setTimeout(res, ttlMs + delay))

    await expect(got.get(exposedUrl)).rejects.toContainEqual(
      expect.objectContaining({
        statusCode: 404,
      }),
    )
  })
})
