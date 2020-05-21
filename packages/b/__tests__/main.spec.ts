import { subscribe, redisClient } from './utils'
import { timeout } from '../src/index'

describe('reach endpoints in the cluster', () => {
  test('endpoint is only available while the endpoint has active subscription', async () => {
    const { unsubscribe, getDeployedImageAddress, getDeployedImagePort } = await subscribe('redis', {
      containerPortToExpose: 6379,
    })

    const redis = redisClient(await getDeployedImageAddress(), await getDeployedImagePort())

    await expect(redis.ping()).resolves.toEqual('PONG')

    await unsubscribe()

    await expect(timeout(redis.ping(), 50)).rejects.toEqual(expect.stringContaining('timeout'))

    redis.forceClose()
  })
})
