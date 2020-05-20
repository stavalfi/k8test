import { redisClient } from './utils'
import { subscribe } from './utils'

describe('test singletone option', () => {
  test('endpoint should be the same when we use singletone option', async () => {
    const subscription1 = await subscribe('redis', {
      containerPortToExpose: 6379,
      isSingelton: true,
    })

    const client1 = redisClient(
      await subscription1.getDeployedImageAddress(),
      await subscription1.getDeployedImagePort(),
    )

    await client1.set('x', '1')

    const subscription2 = await subscribe('redis', {
      containerPortToExpose: 6379,
      isSingelton: true,
    })

    const client2 = redisClient(
      await subscription2.getDeployedImageAddress(),
      await subscription2.getDeployedImagePort(),
    )

    await expect(client2.get('x')).resolves.toEqual('1')

    await subscription1.unsubscribe()
    await subscription2.unsubscribe()
  })

  test('endpoint should be different when we do not use singletone option', async () => {
    const subscription1 = await subscribe('redis', {
      containerPortToExpose: 6379,
      isSingelton: false,
    })

    const client1 = redisClient(
      await subscription1.getDeployedImageAddress(),
      await subscription1.getDeployedImagePort(),
    )

    await client1.set('x', '1')

    const subscription2 = await subscribe('redis', {
      containerPortToExpose: 6379,
      isSingelton: false,
    })

    const client2 = redisClient(
      await subscription2.getDeployedImageAddress(),
      await subscription2.getDeployedImagePort(),
    )

    await expect(client2.get('x')).resolves.not.toEqual('1')

    await subscription1.unsubscribe()
    await subscription2.unsubscribe()
  })
})
