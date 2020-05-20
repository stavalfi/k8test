import redis from 'redis'
import { promisify } from 'util'
import { baseSubscribe, randomAppId, Subscribe } from 'b/src'

export function redisClient(
  address: string,
  port: number,
): { set: (a: string, b: string) => Promise<unknown>; get: (a: string) => Promise<string> } {
  const client = redis.createClient({ host: address, port })

  const set = promisify(client.set).bind(client)
  const get = promisify(client.get).bind(client)

  return { set, get }
}

export const subscribe: Subscribe = (imageName, options) =>
  baseSubscribe({
    ...options,
    imageName,
    appId: randomAppId(),
  })
