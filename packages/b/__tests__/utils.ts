import Redis from 'ioredis'
import { baseSubscribe, randomAppId, Subscribe, NamespaceStrategy } from '../src/'

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

export function cleanupAfterEach() {
  const cleanups: (() => Promise<void> | void)[] = []

  afterEach(async () => {
    await Promise.all(cleanups.map(cleanup => cleanup()))
    cleanups.splice(0, cleanups.length)
  })

  return cleanups
}
