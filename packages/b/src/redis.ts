import * as k8s from '@kubernetes/client-node'
import { deployImageAndExposePort, getDeployedImageUrl, getMasterAddress, getDeployedImagePort } from './k8s-api'
import { ExposeStrategy, isDeploymentExist, generateDeploymentName, generateServicetName } from './k8s-api'
import Redis from 'ioredis'
import { LMXClient } from 'live-mutex'

const LOCK_KEY = 'k8test---setup-redis-for-internal-use'
const MAX_LOCK_TIME = 60_000
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
  const serviceName = generateServicetName(K8TEST_INTERNAL_REsOURCES_APP_ID, imageName)
  const deploymentName = generateDeploymentName(K8TEST_INTERNAL_REsOURCES_APP_ID, imageName)

  const client = new LMXClient()

  return new Promise((res, rej) => {
    client.lock(LOCK_KEY, { ttl: MAX_LOCK_TIME }, (error, unlock) => {
      if (error) {
        return rej(error)
      }
      Promise.resolve()
        .then(async () => {
          const isExist = await isAlreadyDeployedAndExposed({
            apiClient: options.apiClient,
            appsApiClient: options.appsApiClient,
            namespaceName: options.namespaceName,
            deploymentName,
            serviceName,
          })

          if (isExist) {
            return {
              deployedImageUrl: await getDeployedImageUrl({
                apiClient: options.apiClient,
                namespaceName: options.namespaceName,
                serviceName,
              }),
              deployedImageAddress: await getMasterAddress({
                apiClient: options.apiClient,
              }),
              deployedImagePort: await getDeployedImagePort(serviceName, {
                apiClient: options.apiClient,
                namespaceName: options.namespaceName,
              }),
            }
          }

          const deployedRedis = await deployImageAndExposePort({
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
            exposeStrategy: ExposeStrategy.insideCluster,
          })

          return {
            deployedImageUrl: await deployedRedis.getDeployedImageUrl(),
            deployedImageAddress: await deployedRedis.getDeployedImageAddress(),
            deployedImagePort: await deployedRedis.getDeployedImagePort(),
          }
        })
        .then(res, rej)
        .finally(() => unlock())
    })
  })
}

async function isAlreadyDeployedAndExposed(options: {
  appsApiClient: k8s.AppsV1Api
  apiClient: k8s.CoreV1Api
  namespaceName: string
  deploymentName: string
  serviceName: string
}) {
  // todo: check also that the service exist and the deployment is ok and so on.
  return isDeploymentExist(options.deploymentName, {
    appsApiClient: options.appsApiClient,
    namespaceName: options.namespaceName,
  })
}
