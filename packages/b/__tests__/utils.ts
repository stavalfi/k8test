import redis from 'redis'
import { promisify } from 'util'
import { baseSubscribe, randomAppId, Subscribe, NamespaceStrategy } from 'b/src'

export function redisClient(address: string, port: number) {
  const client = redis.createClient({ host: address, port })

  const set = promisify(client.set).bind(client)
  const get = promisify(client.get).bind(client)
  const ping = promisify(client.ping).bind(client)
  const forceClose = () => client.end(false)

  // workaround to avoid sending errors to stdio
  client.on('error', () => {})
  client.unsubscribe('error')

  return { set, get, ping, forceClose }
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
