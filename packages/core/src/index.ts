import chance from 'chance'
import {
  createK8sClient,
  createNamespaceIfNotExist,
  ExposeStrategy,
  SingletonStrategy,
  subscribeToImage,
  unsubscribeFromImage,
} from 'k8s-api'
import { SubscribeCreator as Subscribe, SubscribeCreatorOptions } from './types'

export { deleteNamespaceIfExist } from 'k8s-api'
export { SingletonStrategy, SubscribeCreatorOptions, Subscription } from './types'

export const subscribe: Subscribe = async options => {
  assertOptions(options)

  const appId = getAppId(options.appId)

  const k8sClient = createK8sClient()

  const namespaceName =
    options.singletonStrategy === SingletonStrategy.namespace ? k8testNamespaceName() : randomNamespaceName(appId)

  await createNamespaceIfNotExist({
    appId,
    k8sClient,
    namespaceName,
  })

  const singletonStrategy = options.singletonStrategy || SingletonStrategy.many

  const deployedImage = await subscribeToImage({
    appId,
    k8sClient,
    namespaceName,
    imageName: options.imageName,
    containerPortToExpose: options.containerPortToExpose,
    isReadyPredicate: options.isReadyPredicate,
    exposeStrategy: ExposeStrategy.userMachine,
    singletonStrategy,
  })

  return {
    deploymentName: deployedImage.deploymentName,
    serviceName: deployedImage.serviceName,
    deployedImageUrl: deployedImage.deployedImageUrl,
    deployedImageAddress: deployedImage.deployedImageAddress,
    deployedImagePort: deployedImage.deployedImagePort,
    unsubscribe: async () =>
      unsubscribeFromImage({
        k8sClient,
        namespaceName,
        singletonStrategy,
        deploymentName: deployedImage.deploymentName,
        serviceName: deployedImage.serviceName,
        deployedImageUrl: deployedImage.deployedImageUrl,
      }),
  }
}

export const randomAppId = () =>
  `app-id-${chance()
    .hash()
    .slice(0, 10)}`

export const k8testNamespaceName = () => `k8test`

export const randomNamespaceName = (appId: string) => `k8test-${appId}`

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
