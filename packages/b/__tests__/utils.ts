import Redis from 'ioredis'
import { baseSubscribe, randomAppId, Subscribe, NamespaceStrategy } from '../src/'

export const isRedisReadyPredicate = (url: string, host: string, port: number) => {
  const redis = new Redis({
    host,
    port,
    lazyConnect: true, // because i will try to connect manually in the next line
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
    ...options,
  })
  return redis
}

export const subscribe: Subscribe = (imageName, options) =>
  baseSubscribe({
    imageName,
    appId: randomAppId(),
    namespace: {
      namespaceStrategy: NamespaceStrategy.k8test,
    },
    ...options,
  })

export const customSubscribe = (appId: string): Subscribe => (imageName, options) =>
  baseSubscribe({
    imageName,
    appId,
    namespace: {
      namespaceStrategy: NamespaceStrategy.k8test,
    },
    ...options,
  })

export function cleanupAfterEach() {
  const cleanups: (() => Promise<void> | void)[] = []

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
