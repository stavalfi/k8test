import bodyParser from 'body-parser'
import express, { Express } from 'express'
import Redis from 'ioredis'
import {
  createK8sClient,
  deleteAllK8testNamespaces,
  K8sClient,
  subscribeToImage,
  SubscribeToImageOptions,
  unsubscribeFromImage,
  UnsubscribeFromImageOptions,
} from 'k8s-api'
import { Lock, setupInternalRedis } from './internal-redis'

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

  const k8sClient = createK8sClient()

  await deleteAllK8testNamespaces(k8sClient)

  const { redisClient, lock } = await setupInternalRedis(k8sClient)

  const app = buildService({ k8sClient, redisClient, lock })

  await new Promise(res => app.listen(80, res))
}

main()
