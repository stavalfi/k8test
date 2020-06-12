import bodyParser from 'body-parser'
import express, { Express } from 'express'
import Redis from 'ioredis'
import {
  createK8sClient,
  deleteAllTempResources,
  K8sClient,
  k8testNamespaceName,
  subscribeToImage,
  SubscribeToImageOptions,
  unsubscribeFromImage,
  UnsubscribeFromImageOptions,
  ConnectFrom,
} from 'k8s-api'
import k8testLog from 'k8test-log'
import { Lock, setupInternalRedis } from './internal-redis'

const log = k8testLog('monitoring')

function buildService({
  k8sClient,
  redisClient,
  lock,
}: {
  k8sClient: K8sClient
  redisClient: Redis.Redis
  lock: Lock
}): Express {
  function synchronizedRoute<ReqBody>(
    route: string,
    logic: (req: express.Request & { body: ReqBody }, res: express.Response) => Promise<void>,
  ) {
    return async (req: express.Request & { body: ReqBody }, res: express.Response) => {
      const { unlock } = await lock(route)
      await logic(req, res)
      await unlock()
    }
  }

  const app = express()
  app.use(bodyParser.json())

  app.get('/is-alive', (_req, res) => res.end())

  app.post(
    '/subscribe',
    synchronizedRoute<SubscribeToImageOptions>('subscribe', async (req, res) => {
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
    }),
  )

  app.post(
    '/unsubscribe',
    synchronizedRoute<UnsubscribeFromImageOptions>('unsubscribe', async (req, res) => {
      const options = req.body
      await unsubscribeFromImage({
        k8sClient,
        appId: options.appId,
        imageName: options.imageName,
        namespaceName: options.namespaceName,
        singletonStrategy: options.singletonStrategy,
        deploymentName: options.deploymentName,
        serviceName: options.serviceName,
        deployedImageUrl: options.deployedImageUrl,
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

  const k8sClient = createK8sClient(ConnectFrom.insideCluster)

  await deleteAllTempResources({ k8sClient, namespaceName: k8testNamespaceName() })

  const { redisClient, lock } = await setupInternalRedis(k8sClient)

  const app = buildService({ k8sClient, redisClient, lock })

  await new Promise(res => app.listen(80, res))

  log('service is listening on port 80 inside the cluster')
}

main()
