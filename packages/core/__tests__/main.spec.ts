import { subscribe, randomAppId } from '../src'
import { cleanupAfterEach, isRedisReadyPredicate, redisClient, cliMonitoringPath } from './utils'
import execa from 'execa'
import { k8testNamespaceName } from 'k8s-api'

describe('reach endpoints in the cluster', () => {
  let cleanups = cleanupAfterEach()

  test('endpoint is available while the endpoint has active subscription', async () => {
    const namespaceName = k8testNamespaceName()
    await execa.command(`node ${cliMonitoringPath} start-monitoring --local-image --namespace ${namespaceName}`)
    const { unsubscribe, deployedImageAddress, deployedImagePort } = await subscribe({
      imageName: 'redis',
      containerPortToExpose: 6379,
      appId: randomAppId(),
      isReadyPredicate: isRedisReadyPredicate,
    })

    cleanups.push(unsubscribe)
    cleanups.push(() => execa.command(`node ${cliMonitoringPath} delete-monitoring --namespace ${namespaceName}`))

    const redis = redisClient({
      host: deployedImageAddress,
      port: deployedImagePort,
    })
    cleanups.push(() => redis.disconnect())

    await expect(redis.ping()).resolves.toEqual('PONG')
  })

  test('endpoint is not available after unsubscribe', async () => {
    const { unsubscribe, deployedImageAddress, deployedImagePort } = await subscribe({
      imageName: 'redis',
      containerPortToExpose: 6379,
      appId: randomAppId(),
      isReadyPredicate: isRedisReadyPredicate,
    })

    const redis = redisClient({
      host: deployedImageAddress,
      port: deployedImagePort,
    })
    cleanups.push(() => redis.disconnect())

    await unsubscribe()

    await expect(redis.ping()).rejects.toThrow(expect.objectContaining({ name: 'MaxRetriesPerRequestError' }))
  })
})
