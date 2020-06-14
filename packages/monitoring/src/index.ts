import bodyParser from 'body-parser'
import express, { Express } from 'express'
import Redis from 'ioredis'
import {
  ConnectionFrom,
  createK8sClient,
  deleteAllTempResources,
  DeployedImage,
  K8sClient,
  k8testNamespaceName,
  SerializedSubscribeToImageOptions,
  subscribeToImage,
  unsubscribeFromImage,
  UnsubscribeFromImageOptions,
  SingletonStrategy,
  generateResourceName,
} from 'k8s-api'
import k8testLog from 'k8test-log'
import { setupInternalRedis, SyncTask } from './internal-redis'

const log = k8testLog('monitoring')

function buildService({
  k8sClient,
  redisClient,
  syncTask,
  redisDeployment,
}: {
  k8sClient: K8sClient
  redisClient: Redis.Redis
  syncTask: SyncTask
  redisDeployment: DeployedImage
}): Express {
  const app = express()
  app.use(bodyParser.json())

  app.get('/is-alive', (_req, res) => res.end())

  app.post<{}, DeployedImage, SerializedSubscribeToImageOptions>('/subscribe', (req, res) =>
    syncTask('subscribe', async () => {
      const options = req.body
      const deployedImage = await subscribeToImage({
        k8sClient,
        appId: options.appId,
        namespaceName: options.namespaceName,
        imageName: options.imageName,
        containerPortToExpose: options.containerPortToExpose,
        exposeStrategy: options.exposeStrategy,
        singletonStrategy: options.singletonStrategy,
        containerOptions: options.containerOptions,
      })
      res.json(deployedImage)
      res.end()
    }),
  )

  app.post<{}, {}, UnsubscribeFromImageOptions>('/unsubscribe', (req, res) =>
    syncTask('unsubscribe', async () => {
      const options = req.body
      await unsubscribeFromImage({
        k8sClient,
        appId: options.appId,
        imageName: options.imageName,
        namespaceName: options.namespaceName,
        singletonStrategy: options.singletonStrategy,
        deploymentName: options.deploymentName,
        serviceName: options.serviceName,
      })
      res.end()
    }),
  )

  app.delete<{}, {}, {}>('/delete-internal-resources', (req, res) =>
    syncTask('delete-internal-resources', async () => {
      const getName = (imageName: string) =>
        generateResourceName({
          imageName,
          namespaceName: k8testNamespaceName(),
          singletonStrategy: SingletonStrategy.oneInNamespace,
        })
      await unsubscribeFromImage({
        k8sClient,
        imageName: 'redis',
        namespaceName: k8testNamespaceName(),
        singletonStrategy: SingletonStrategy.oneInNamespace,
        deploymentName: getName('redis'),
        serviceName: getName('redis'),
        forceDelete: true,
      })
      res.end()
    }),
  )

  return app
}

async function main() {
  // eslint-disable-next-line no-console
  process.on('unhandledRejection', e => console.error(e))

  log('starting service code...')

  const k8sClient = createK8sClient(ConnectionFrom.insideCluster)

  await deleteAllTempResources({ k8sClient, namespaceName: k8testNamespaceName() })

  const { redisClient, redisDeployment, syncTask } = await setupInternalRedis(k8sClient)

  const app = buildService({ k8sClient, redisClient, redisDeployment, syncTask })

  await new Promise(res => app.listen(80, res))

  log('service is listening on port 80 inside the cluster (this service will be used only outside of cluster)')
}

main()
