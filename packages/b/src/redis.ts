import * as k8s from '@kubernetes/client-node'
import Redis from 'ioredis'
import { deployImageAndExposePort, ExposeStrategy } from './k8s-api'

const K8TEST_INTERNAL_REsOURCES_APP_ID = 'k8test-internal'

export async function makeSureRedisIsDeployedAndExposed(options: {
  appId: string
  appsApiClient: k8s.AppsV1Api
  apiClient: k8s.CoreV1Api
  watchClient: k8s.Watch
  namespaceName: string
}): Promise<{
  deployedImageUrl: string
  deployedImageAddress: string
  deployedImagePort: number
}> {
  const imageName = 'redis'
  const containerPortToExpose = 6379
  const exposeStrategy = ExposeStrategy.userMachine

  return deployImageAndExposePort({
    appId: K8TEST_INTERNAL_REsOURCES_APP_ID,
    apiClient: options.apiClient,
    appsApiClient: options.appsApiClient,
    watchClient: options.watchClient,
    namespaceName: options.namespaceName,
    imageName,
    containerPortToExpose,
    isReadyPredicate: (url, host, port) => {
      const redis = new Redis({
        host,
        port,
        lazyConnect: true, // because i will try to connect manually in the next line
      })
      return redis.connect()
    },
    exposeStrategy,
    dontFailIfExistAndExposed: true,
  })
}
