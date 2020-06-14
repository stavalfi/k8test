import got from 'got'
import {
  createK8sClient,
  createNamespaceIfNotExist,
  ExposeStrategy,
  k8testNamespaceName,
  randomAppId,
  SingletonStrategy,
  subscribeToImage,
  grantAdminRoleToCluster,
  ConnectionFrom,
  SerializedDeployedImageProps,
} from 'k8s-api'
import { SubscribeCreator as Subscribe, SubscribeCreatorOptions } from './types'
import k8testLog from 'k8test-log'

export { deleteNamespaceIfExist, SingletonStrategy, randomAppId } from 'k8s-api'
export { SubscribeCreatorOptions, Subscription } from './types'

const log = k8testLog('core')

export const subscribe: Subscribe = async options => {
  assertOptions(options)

  const appId = getAppId(options.appId)

  const k8sClient = createK8sClient(ConnectionFrom.outsideCluster)

  await grantAdminRoleToCluster(k8sClient)

  const singletonStrategy = options.singletonStrategy || SingletonStrategy.manyInAppId

  const namespaceName = k8testNamespaceName()

  await createNamespaceIfNotExist({
    appId,
    k8sClient,
    namespaceName,
  })

  const monitoringDeployedImage = await subscribeToImage({
    k8sClient,
    namespaceName: k8testNamespaceName(),
    imageName: 'stavalfi/k8test-monitoring',
    containerPortToExpose: 80,
    exposeStrategy: ExposeStrategy.userMachine,
    singletonStrategy: SingletonStrategy.oneInNamespace,
    // this option exist for cases where we try to create the same resource from multiple processes at the same time and we can't synchronize them,
    // so we avoid a situation where some processes will try to delete while others try to create.
    // for now, this is one of the use-cases: when we subscribe the monitoring service multiple times from multiple test-runner processes.
    failFastIfExist: true,
    ...(options.debugMonitoringService && {
      podStdio: {
        stdout: process.stdout,
        stderr: process.stderr,
      },
    }),
    // before tests, we build a local version of stavalfi/k8test-monitoring image from the source code and it is not exist in docker-registry yet.
    // eslint-disable-next-line no-process-env
    ...(process.env['K8TEST_TEST_MODE'] === 'true' && {
      containerOptions: { imagePullPolicy: 'Never' },
    }),
  })

  log(
    'waiting until the service in image "%s" is reachable using the address: "%s" from outside the cluster',
    'k8test-monitoring',
    monitoringDeployedImage.deployedImageUrl,
  )

  await waitUntilReady(() =>
    got.get(`${monitoringDeployedImage.deployedImageUrl}/is-alive`, {
      timeout: 1000,
    }),
  )

  log(
    'image "%s" is reachable using the address: "%s" from outside the cluster',
    'k8test-monitoring',
    monitoringDeployedImage.deployedImageUrl,
  )

  const { body: deployedImage } = await got.post<SerializedDeployedImageProps>(
    `${monitoringDeployedImage.deployedImageUrl}/subscribe`,
    {
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
    },
  )

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
      await got.post(`${monitoringDeployedImage.deployedImageUrl}/unsubscribe`, {
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
    monitoringServiceContainerStdioAttachment: monitoringDeployedImage.containerStdioAttachment,
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
