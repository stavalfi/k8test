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

export { deleteNamespaceIfExist, randomAppId, SingletonStrategy } from 'k8s-api'
export { SubscribeCreatorOptions, Subscription } from './types'

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

  const monitoringDeployedImage = await subscribeToImage({
    appId: internalK8testResourcesAppId(),
    k8sClient,
    namespaceName: k8testNamespaceName(),
    imageName: 'k8test-monitoring',
    containerPortToExpose: 80,
    exposeStrategy: ExposeStrategy.userMachine,
    singletonStrategy: SingletonStrategy.oneInCluster,
  })

  const { body: deployedImage } = await got.get<DeployedImage>(
    `${monitoringDeployedImage.deployedImageUrl}/subscribe`,
    {
      json: {
        appId,
        k8sClient,
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

  return {
    deploymentName: deployedImage.deploymentName,
    serviceName: deployedImage.serviceName,
    deployedImageUrl: deployedImage.deployedImageUrl,
    deployedImageAddress: deployedImage.deployedImageAddress,
    deployedImagePort: deployedImage.deployedImagePort,
    unsubscribe: async () =>
      got
        .get(`${monitoringDeployedImage.deployedImageUrl}/unsubscribe`, {
          json: {
            k8sClient,
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

async function waitUntilReady(isReadyPredicate: () => Promise<void>): Promise<void> {
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
