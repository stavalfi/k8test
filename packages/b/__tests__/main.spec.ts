import got from 'got'
import { subscribe } from './utils'

describe('reach endpoints in the cluster', () => {
  test('endpoint is only available while the endpoint has active subscription', async () => {
    const { unsubscribe, getDeployedImageUrl } = await subscribe('verdaccio/verdaccio', {
      containerPortToExpose: 4873,
    })

    const deployedImageUrl = await getDeployedImageUrl()

    await expect(got.get(deployedImageUrl)).resolves.toEqual(
      expect.objectContaining({
        statusCode: 200,
      }),
    )

    await unsubscribe()

    await expect(got.get(deployedImageUrl, { timeout: 100 })).rejects.toEqual(
      expect.objectContaining({
        statusCode: 404,
      }),
    )
  })
})
