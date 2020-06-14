import got from 'got'
import {
  ConnectionFrom,
  createK8sClient,
  ExposeStrategy,
  generateResourceName,
  getDeployedImageConnectionDetails,
  grantAdminRoleToCluster,
  k8testNamespaceName,
  randomAppId,
  SingletonStrategy,
  DeployedImage,
} from 'k8s-api'
import k8testLog from 'k8test-log'
import { SubscribeCreator as Subscribe, SubscribeCreatorOptions } from './types'
import { waitUntilReady } from './utils'

export { deleteNamespaceIfExist, randomAppId, SingletonStrategy } from 'k8s-api'
export { SubscribeCreatorOptions, Subscription } from './types'

const log = k8testLog('core')

export const subscribe: Subscribe = async options => {
  assertOptions(options)

  const appId = getAppId(options.appId)

  const k8sClient = createK8sClient(ConnectionFrom.outsideCluster)

  await grantAdminRoleToCluster(k8sClient)

  const singletonStrategy = options.singletonStrategy || SingletonStrategy.manyInAppId

  const namespaceName = k8testNamespaceName()

  const { deployedImageUrl: monitoringDeployedImageUrl } = await getDeployedImageConnectionDetails({
    k8sClient,
    exposeStrategy: ExposeStrategy.userMachine,
    namespaceName: k8testNamespaceName(),
    serviceName: generateResourceName({
      imageName: 'stavalfi/k8test-monitoring',
      namespaceName: k8testNamespaceName(),
      singletonStrategy: SingletonStrategy.oneInNamespace,
    }),
  })

  const { body: deployedImage } = await got.post<DeployedImage>(`${monitoringDeployedImageUrl}/subscribe`, {
    responseType: 'json',
    json: {
      appId,
      namespaceName,
      imageName: options.imageName,
      containerPortToExpose: options.containerPortToExpose,
      exposeStrategy: ExposeStrategy.userMachine,
      singletonStrategy,
      containerOptions: options.containerOptions,
    },
  })

  log(
    'waiting until the service in image "%s" is reachable using the address: "%s" from outside the cluster',
    options.imageName,
    deployedImage.deployedImageUrl,
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
    'image "%s" is reachable using the address: "%s" from outside the cluster',
    options.imageName,
    deployedImage.deployedImageUrl,
  )

  return {
    deploymentName: deployedImage.deploymentName,
    serviceName: deployedImage.serviceName,
    deployedImageUrl: deployedImage.deployedImageUrl,
    deployedImageAddress: deployedImage.deployedImageAddress,
    deployedImagePort: deployedImage.deployedImagePort,
    unsubscribe: async () => {
      await got.post(`${monitoringDeployedImageUrl}/unsubscribe`, {
        json: {
          appId,
          imageName: options.imageName,
          namespaceName,
          singletonStrategy,
          deploymentName: deployedImage.deploymentName,
          serviceName: deployedImage.serviceName,
          deployedImageUrl: deployedImage.deployedImageUrl,
        },
      })
    },
  }
}

function assertOptions(options: SubscribeCreatorOptions): void {
  if (options.appId && options.appId.length !== randomAppId().length) {
    throw new Error(
      'please use `randomAppId` function for generating the appId. k8s apis expect specific length when we use `appId` to generate k8s resources names.',
    )
  }
}

const getAppId = (appId?: string): string => {
  const result = [
    appId,
    // eslint-disable-next-line no-process-env
    process.env['APP_ID'],
    // @ts-ignore
    this['APP_ID'],
    // @ts-ignore
    global['APP_ID'],
    // @ts-ignore
    globalThis['APP_ID'],
  ].find(Boolean)
  if (result) {
    return result
  }
  throw new Error(`APP_ID can't be falsy`)
}
