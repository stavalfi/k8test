import execa from 'execa'
import { randomAppId, subscribe } from '../src'
import { cleanupAfterEach, cliMonitoringPath, isRedisReadyPredicate, redisClient, randomNamespaceName } from './utils'

describe('reach endpoints in the cluster', () => {
  let cleanups = cleanupAfterEach()

  test.only('endpoint is available while the endpoint has active subscription', async () => {
    const namespaceName = randomNamespaceName()
    await execa.command(`node ${cliMonitoringPath} start-monitoring --local-image --namespace ${namespaceName}`, {
      extendEnv: false,
      // eslint-disable-next-line no-process-env
      env: { ...(process.env['DEBUG'] && { DEBUG: process.env['DEBUG'] }) },
      stdio: 'inherit',
    })
    const { unsubscribe, deployedImageAddress, deployedImagePort } = await subscribe({
      imageName: 'redis',
      containerPortToExpose: 6379,
      namespaceName,
      appId: randomAppId(),
      isReadyPredicate: isRedisReadyPredicate,
    })

    cleanups.push(unsubscribe)
    cleanups.push(() =>
      execa.command(`node ${cliMonitoringPath} delete-monitoring --namespace ${namespaceName}`, {
        extendEnv: false,
        // eslint-disable-next-line no-process-env
        env: { ...(process.env['DEBUG'] && { DEBUG: process.env['DEBUG'] }) },
        stdio: 'inherit',
      }),
    )

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
