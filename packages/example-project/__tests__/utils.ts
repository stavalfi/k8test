import Redis from 'ioredis'
import { baseSubscribe, NamespaceStrategy, Subscribe } from 'k8test'

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

export const subscribe: Subscribe = (imageName, options) =>
  baseSubscribe({
    imageName,
    appId: APP_ID, // IMPORTANT! the same random hash in all test files will make sure you will never use the same deployments from last tests!!!!!
    namespace: {
      namespaceStrategy: NamespaceStrategy.k8test,
    },
    ...options,
  })
