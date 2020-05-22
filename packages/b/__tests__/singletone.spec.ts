import { redisClient, cleanupAfterEach } from './utils'
import { subscribe } from './utils'

describe('test singletone option', () => {
  let cleanups = cleanupAfterEach()

  test('endpoint should be different when we do not use singletone option', async () => {
    const subscription1 = await subscribe('redis', {
      containerPortToExpose: 6379,
      isSingelton: false,
    })
    cleanups.push(subscription1.unsubscribe)

    const client1 = redisClient({
      host: subscription1.deployedImageAddress,
      port: subscription1.deployedImagePort,
    })
    cleanups.push(() => client1.disconnect())

    await client1.set('x', '1')

    const subscription2 = await subscribe('redis', {
      containerPortToExpose: 6379,
      isSingelton: false,
    })
    cleanups.push(subscription2.unsubscribe)

    const client2 = redisClient({
      host: subscription2.deployedImageAddress,
      port: subscription2.deployedImagePort,
    })
    cleanups.push(() => client2.disconnect())

    await expect(client2.get('x')).resolves.not.toEqual('1')
  })

  // eslint-disable-next-line jest/no-focused-tests
  test.only('endpoint should be the same when we use singletone option', async () => {
    const subscription1 = await subscribe('redis', {
      containerPortToExpose: 6379,
      isSingelton: true,
    })
    cleanups.push(subscription1.unsubscribe)

    const client1 = redisClient({
      host: subscription1.deployedImageAddress,
      port: subscription1.deployedImagePort,
    })
    cleanups.push(() => client1.disconnect())

    await client1.set('x', '1')

    const subscription2 = await subscribe('redis', {
      containerPortToExpose: 6379,
      isSingelton: true,
    })
    cleanups.push(subscription2.unsubscribe)

    const client2 = redisClient({
      host: subscription2.deployedImageAddress,
      port: subscription2.deployedImagePort,
    })
    cleanups.push(() => client2.disconnect())

    await expect(client2.get('x')).resolves.toEqual('1')
  })
})
