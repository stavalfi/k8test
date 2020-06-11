/* eslint-disable no-console */
import pkg from 'k8test'
import Redis from 'ioredis'

const { NamespaceStrategy, randomAppId, subscribe } = pkg

export const isRedisReadyPredicate = (url, host, port) => {
  const redis = new Redis({
    connectTimeout: 1000,
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

async function main() {
  const appId = randomAppId()

  const [subscription1, subscription2] = await Promise.all([
    subscribe({
      imageName: 'redis',
      containerPortToExpose: 6379,
      appId,
      namespace: {
        namespaceStrategy: NamespaceStrategy.k8test,
      },
      isReadyPredicate: isRedisReadyPredicate,
    }),
    subscribe({
      imageName: 'redis',
      containerPortToExpose: 6379,
      appId,
      namespace: {
        namespaceStrategy: NamespaceStrategy.k8test,
      },
      isReadyPredicate: isRedisReadyPredicate,
    }),
  ])
  console.log('1-----------------------------------')

  const client1 = new Redis({
    host: subscription1.deployedImageAddress, // this is the minikube cluster address on your machine
    port: subscription1.deployedImagePort, // this can be any available port on your machine
  })

  console.log('2-----------------------------------')

  await client1.set('x', '1')
  console.log(await client1.get('x'))

  console.log('3-----------------------------------')

  const client2 = new Redis({
    host: subscription2.deployedImageAddress, // this is the minikube cluster address on your machine
    port: subscription2.deployedImagePort, // this can be any available port on your machine
  })

  console.log('4-----------------------------------')

  const result = await client2.get('x')
  console.log(result)

  client1.disconnect()
  client2.disconnect()

  // console.log('------------------')
  // console.log(process._getActiveHandles())
}

main()
