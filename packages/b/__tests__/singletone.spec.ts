import { redisClient } from './utils'
import { subscribe } from './utils'

describe('test singletone option', () => {
  test('endpoint should be the same when we use singletone option', async () => {
    const subscription1 = await subscribe('redis', {
      containerPortToExpose: 6379,
      isSingelton: true,
    })

    const client1 = redisClient(subscription1.exposedAddress, subscription1.exposedPort)

    await client1.set('x', '1')

    const subscription2 = await subscribe('redis', {
      containerPortToExpose: 6379,
      isSingelton: true,
    })

    const client2 = redisClient(subscription2.exposedAddress, subscription2.exposedPort)

    await expect(client2.get('x')).resolves.toEqual('1')

    await subscription1.unsubscribe()
    await subscription2.unsubscribe()
  })

  test('endpoint should be different when we do not use singletone option', async () => {
    const subscription1 = await subscribe('redis', {
      containerPortToExpose: 6379,
      isSingelton: false,
    })

    const client1 = redisClient(subscription1.exposedAddress, subscription1.exposedPort)

    await client1.set('x', '1')

    const subscription2 = await subscribe('redis', {
      containerPortToExpose: 6379,
      isSingelton: false,
    })

    const client2 = redisClient(subscription2.exposedAddress, subscription2.exposedPort)

    await expect(client2.get('x')).resolves.not.toEqual('1')

    await subscription1.unsubscribe()
    await subscription2.unsubscribe()
  })
})
