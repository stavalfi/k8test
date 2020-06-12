import got from 'got'
import {
  createK8sClient,
  createNamespaceIfNotExist,
  DeployedImage,
  ExposeStrategy,
  internalK8testResourcesAppId,
  k8testNamespaceName,
  randomAppId,
  SingletonStrategy,
  subscribeToImage,
} from 'k8s-api'
import { SubscribeCreator as Subscribe, SubscribeCreatorOptions } from './types'
import k8testLog from 'k8test-log'
import { setupInternalRedis } from './setup-internal-redis'

export { deleteNamespaceIfExist, randomAppId, SingletonStrategy } from 'k8s-api'
export { SubscribeCreatorOptions, Subscription } from './types'

const log = k8testLog('core')

export const subscribe: Subscribe = async options => {
  assertOptions(options)

  const appId = getAppId(options.appId)

  const k8sClient = createK8sClient()

  const singletonStrategy = options.singletonStrategy || SingletonStrategy.manyInAppId

  const namespaceName = k8testNamespaceName()

  await Promise.all(
    [
      createNamespaceIfNotExist({
        appId,
        k8sClient,
        namespaceName,
      }),
    ].concat(
      namespaceName !== k8testNamespaceName()
        ? [
            createNamespaceIfNotExist({
              appId,
              k8sClient,
              namespaceName: k8testNamespaceName(),
            }),
          ]
        : [],
    ),
  )

  await setupInternalRedis(k8sClient)

  const monitoringDeployedImage = await subscribeToImage({
    appId: internalK8testResourcesAppId(),
    k8sClient,
    namespaceName: k8testNamespaceName(),
    imageName: 'k8test-monitoring',
    containerPortToExpose: 80,
    exposeStrategy: ExposeStrategy.userMachine,
    singletonStrategy: SingletonStrategy.oneInCluster,
  })

  await waitUntilReady(() =>
    got.get(`${monitoringDeployedImage.deployedImageUrl}/is-alive`, {
      timeout: 1000,
    }),
  )

  log(
    'image "%s". is reachable using the url: "%s" from outside the cluster',
    'k8test-monitoring',
    monitoringDeployedImage.deployedImageUrl,
  )

  const { body: deployedImage } = await got.post<DeployedImage>(
    `${monitoringDeployedImage.deployedImageUrl}/subscribe`,
    {
      json: {
        k8sClient,
        appId,
        namespaceName,
        imageName: options.imageName,
        containerPortToExpose: options.containerPortToExpose,
        exposeStrategy: ExposeStrategy.userMachine,
        singletonStrategy,
      },
    },
  )

  const { isReadyPredicate } = options
  if (isReadyPredicate) {
    await waitUntilReady(() =>
      isReadyPredicate(
        deployedImage.deployedImageUrl,
        deployedImage.deployedImageAddress,
        deployedImage.deployedImagePort,
      ),
    )
  }

  log(
    'image "%s". is reachable using the url: "%s" from outside the cluster',
    options.imageName,
    deployedImage.deployedImageUrl,
  )

  return {
    deploymentName: deployedImage.deploymentName,
    serviceName: deployedImage.serviceName,
    deployedImageUrl: deployedImage.deployedImageUrl,
    deployedImageAddress: deployedImage.deployedImageAddress,
    deployedImagePort: deployedImage.deployedImagePort,
    unsubscribe: async () =>
      got
        .post(`${monitoringDeployedImage.deployedImageUrl}/unsubscribe`, {
          json: {
            k8sClient,
            appId,
            imageName: options.imageName,
            namespaceName,
            singletonStrategy,
            deploymentName: deployedImage.deploymentName,
            serviceName: deployedImage.serviceName,
            deployedImageUrl: deployedImage.deployedImageUrl,
          },
        })
        .then(() => {}),
  }
}

async function waitUntilReady(isReadyPredicate: () => Promise<unknown>): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await isReadyPredicate()
      return
    } catch (e) {
      await new Promise(res => setTimeout(res, 1000))
    }
  }
}

function assertOptions(options: SubscribeCreatorOptions): void {
  if (options.appId && options.appId.length !== randomAppId().length) {
    throw new Error(
      'please use `randomAppId` function for generating the appId. k8s apis expect specific length when we use `appId` to generate k8s resources names.',
    )
  }
}

function getAppId(appId?: string): string {
  const error = new Error(`APP_ID can't be falsy`)
  if (appId) {
    return appId
  }
  // eslint-disable-next-line no-process-env
  const appIdEnv = process.env['APP_ID']
  if (appIdEnv) {
    return appIdEnv
  }
  if ('APP_ID' in global && global['APP_ID']) {
    return global['APP_ID']
  }
  // @ts-ignore
  const appIdGlobal = globalThis['APP_ID']
  if (appIdGlobal) {
    return appIdGlobal
  }
  throw error
}
