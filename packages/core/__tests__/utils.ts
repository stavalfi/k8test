import Redis from 'ioredis'
import chance from 'chance'

export const cliMonitoringPath = require.resolve('k8test-cli-logic/dist/src/index.js')

export const randomNamespaceName = () =>
  `k8test-${chance()
    .hash()
    .toLocaleLowerCase()}`

export const isRedisReadyPredicate = (url: string, host: string, port: number) => {
  const redis = new Redis({
    host,
    port,
    lazyConnect: true, // because i will try to connect manually in the next line,
    connectTimeout: 1000,
  })

  return redis.connect().finally(() => {
    try {
      redis.disconnect()
    } catch {
      // ignore error
    }
  })
}
export function redisClient(options: Redis.RedisOptions) {
  const redis = new Redis({
    maxRetriesPerRequest: 1,
    connectTimeout: 1000,
    ...options,
  })
  return redis
}

export function cleanupAfterEach() {
  const cleanups: (() => Promise<unknown> | unknown)[] = []

  afterEach(async () => {
    await Promise.all(cleanups.map(cleanup => cleanup())).catch(e => {
      // eslint-disable-next-line no-console
      console.error(JSON.stringify(e, null, 2))
      throw e
    })
    cleanups.splice(0, cleanups.length)
  })

  return cleanups
}
