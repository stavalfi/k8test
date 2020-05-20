import got from 'got'
import { subscribe } from './utils'

describe('reach endpoints in the cluster', () => {
  test('endpoint is only available while the endpoint has active subscription', async () => {
    const { unsubscribe, getDeployedImageUrl } = await subscribe('redis', {
      containerPortToExpose: 6379,
    })

    const deployedImageUrl = await getDeployedImageUrl()

    await expect(got.get(deployedImageUrl)).resolves.toContainEqual(
      expect.objectContaining({
        statusCode: 200,
      }),
    )

    await unsubscribe()

    await expect(got.get(deployedImageUrl)).rejects.toContainEqual(
      expect.objectContaining({
        statusCode: 404,
      }),
    )
  })
})
