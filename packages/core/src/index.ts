import got from 'got'
import {
  ConnectionFrom,
  createK8sClient,
  defaultK8testNamespaceName,
  DeployedImage,
  ExposeStrategy,
  generateResourceName,
  getDeployedImageConnectionDetails,
  randomAppId,
  SingletonStrategy,
} from 'k8s-api'
import k8testLog from 'k8test-log'
import { SubscribeCreator as Subscribe, SubscribeCreatorOptions } from './types'
import { waitUntilReady } from './utils'
import chance from 'chance'

export { defaultK8testNamespaceName, randomAppId, SingletonStrategy } from 'k8s-api'
export { SubscribeCreatorOptions, Subscription } from './types'

const log = k8testLog('core')

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

export const subscribe: Subscribe = async options => {
  assertOptions(options)

  const namespaceName = options.namespaceName || defaultK8testNamespaceName()

  const appId = getAppId(options.appId)

  const k8sClient = createK8sClient(ConnectionFrom.outsideCluster)

  const singletonStrategy = options.singletonStrategy || SingletonStrategy.manyInAppId

  const postfix =
    options.postfix || singletonStrategy === SingletonStrategy.manyInAppId
      ? chance()
          .hash()
          .toLocaleLowerCase()
          .slice(0, 5)
      : ''

  const { deployedImageUrl: monitoringDeployedImageUrl } = await getDeployedImageConnectionDetails({
    k8sClient,
    exposeStrategy: ExposeStrategy.userMachine,
    namespaceName,
    serviceName: generateResourceName({
      imageName: 'stavalfi/k8test-monitoring',
      namespaceName,
      singletonStrategy: SingletonStrategy.oneInNamespace,
    }),
  })

  const { body: deployedImage } = await got.post<DeployedImage>(`${monitoringDeployedImageUrl}/subscribe`, {
    responseType: 'json',
    json: {
      appId,
      namespaceName,
      imageName: options.imageName,
      postfix,
      imagePort: options.imagePort,
      exposeStrategy: ExposeStrategy.userMachine,
      singletonStrategy,
      containerOptions: options.containerOptions,
    },
  })

  log(
    'waiting until the service in resource "%s" is reachable using the address: "%s" from outside the cluster',
    deployedImage.deploymentName,
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
    'resource "%s" is reachable using the address: "%s" from outside the cluster',
    deployedImage.deploymentName,
    deployedImage.deployedImageUrl,
  )

  return {
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
