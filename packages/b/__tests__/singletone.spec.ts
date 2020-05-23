import { redisClient, cleanupAfterEach } from './utils'
import { subscribe } from './utils'
import { SingletoneStrategy } from 'b/src/types'

describe('test singletone option', () => {
  let cleanups = cleanupAfterEach()

  test('endpoint should be different when we do not use singletone option', async () => {
    const subscription1 = await subscribe('redis', {
      containerPortToExpose: 6379,
      singletoneStrategy: SingletoneStrategy.many,
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
      singletoneStrategy: SingletoneStrategy.many,
    })
    cleanups.push(subscription2.unsubscribe)

    const client2 = redisClient({
      host: subscription2.deployedImageAddress,
      port: subscription2.deployedImagePort,
    })
    cleanups.push(() => client2.disconnect())

    await expect(client2.get('x')).resolves.not.toEqual('1')
  })

  test('endpoint should be the same when we share instance per app-id', async () => {
    const subscription1 = await subscribe('redis', {
      containerPortToExpose: 6379,
      singletoneStrategy: SingletoneStrategy.appId,
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
      singletoneStrategy: SingletoneStrategy.appId,
    })
    cleanups.push(subscription2.unsubscribe)

    const client2 = redisClient({
      host: subscription2.deployedImageAddress,
      port: subscription2.deployedImagePort,
    })
    cleanups.push(() => client2.disconnect())

    await expect(client2.get('x')).resolves.toEqual('1')
  })

  test('endpoint should be the same when we share instance per namespace', async () => {
    const subscription1 = await subscribe('redis', {
      containerPortToExpose: 6379,
      singletoneStrategy: SingletoneStrategy.namespace,
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
      singletoneStrategy: SingletoneStrategy.namespace,
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
