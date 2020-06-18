import bodyParser from 'body-parser'
import { Lock } from 'concurrentp'
import express, { Express } from 'express'
import {
  ConnectionFrom,
  createK8sClient,
  deleteResourceIf,
  DeployedImage,
  generateResourceName,
  isTempResource,
  K8sClient,
  SerializedSubscribeToImageOptions,
  SingletonStrategy,
  subscribeToImage,
  unsubscribeFromImage,
  UnsubscribeFromImageOptions,
} from 'k8s-api'
import k8testLog from 'k8test-log'

const log = k8testLog('monitoring')

function getLock(locks: Map<string, Lock>, lockIdentifier: string): Lock {
  const lock = locks.get(lockIdentifier)
  if (!lock) {
    const newLock = new Lock()
    locks.set(lockIdentifier, newLock)
    return newLock
  }
  return lock
}

function buildService({
  k8sClient,
  syncTask,
  namespaceName,
}: {
  k8sClient: K8sClient
  syncTask: <SyncTaskReturnType>(
    lockIdentifier: string,
    task: () => Promise<SyncTaskReturnType>,
  ) => Promise<SyncTaskReturnType>
  namespaceName: string
}): Express {
  const app = express()
  app.use(bodyParser.json())

  app.get('/is-alive', (_req, res) => res.end('true'))

  app.post<{}, DeployedImage, SerializedSubscribeToImageOptions>('/subscribe', (req, res) =>
    syncTask('subscribe', async () => {
      const options = req.body
      const deployedImage = await subscribeToImage({
        k8sClient,
        appId: options.appId,
        namespaceName: options.namespaceName,
        imageName: options.imageName,
        postfix: options.postfix,
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
          namespaceName,
          singletonStrategy: SingletonStrategy.oneInNamespace,
        })
      await unsubscribeFromImage({
        k8sClient,
        imageName: 'redis',
        namespaceName,
        singletonStrategy: SingletonStrategy.oneInNamespace,
        deploymentName: getName('redis'),
        serviceName: getName('redis'),
        forceDelete: true,
      })
      res.end()
    }),
  )

  app.get('/', (_req, res) => res.end('alive'))

  return app
}

async function main() {
  // eslint-disable-next-line no-console
  process.on('unhandledRejection', e => console.error(e))

  // eslint-disable-next-line no-process-env
  const namespaceName = process.env['K8S_NAMESPACE']

  if (!namespaceName) {
    throw new Error('process.env.K8S_NAMESPACE cant be falsy')
  }

  log('starting service code on namespace "%s"', namespaceName)

  const k8sClient = createK8sClient(ConnectionFrom.insideCluster)

  await deleteResourceIf({ k8sClient, namespaceName, predicate: isTempResource })

  const locks = new Map<string, Lock>()

  const app = buildService({
    k8sClient,
    namespaceName,
    syncTask: async (lockIdentifier, task) => {
      const lock = getLock(locks, lockIdentifier)
      await lock.acquire()
      const result = await task()
      await lock.release()
      return result
    },
  })

  await new Promise(res => app.listen(80, res))

  log('service is listening on port 80 inside the cluster (this service will be used only outside of cluster)')
}

// eslint-disable-next-line no-floating-promise/no-floating-promise
main()
