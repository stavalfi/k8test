import 'source-map-support/register'
import * as k8s from '@kubernetes/client-node'
import chance from 'chance'
import {
  createeK8sClient,
  createNamespaceIfNotExist,
  deployImageAndExposePort,
  deleteAllImageResources,
} from './k8s-api'
import { Namespace, SubscribeCreator as BaseSubscribe, SubscribeCreatorOptions } from './types'

export { Namespace, NamespaceStrategy, Subscribe, Subscription } from './types'
export { deleteNamespaceIfExist } from './k8s-api'

export const baseSubscribe: BaseSubscribe = async options => {
  assertOptions(options)

  const k8sClients = createeK8sClient()
  const namespaceName = await extractNamespaceName({
    appId: options.appId,
    apiClient: k8sClients.apiClient,
    watchClient: k8sClients.watchClient,
    namespace: options.namespace,
  })
  const deployedImage = await deployImageAndExposePort({
    appId: options.appId,
    apiClient: k8sClients.apiClient,
    appsApiClient: k8sClients.appsApiClient,
    watchClient: k8sClients.watchClient,
    namespaceName,
    imageName: options.imageName,
    containerPortToExpose: options.containerPortToExpose,
    isReadyPredicate: options.isReadyPredicate,
  })
  return {
    deploymentName: deployedImage.deploymentName,
    serviceName: deployedImage.serviceName,
    getDeployedImageUrl: deployedImage.getDeployedImageUrl,
    getDeployedImageAddress: deployedImage.getDeployedImageAddress,
    getDeployedImagePort: deployedImage.getDeployedImagePort,
    unsubscribe: () =>
      deleteAllImageResources({
        apiClient: k8sClients.apiClient,
        appsApiClient: k8sClients.appsApiClient,
        watchClient: k8sClients.watchClient,
        namespaceName,
        deploymentName: deployedImage.deploymentName,
        serviceName: deployedImage.serviceName,
      }),
  }
}

export const randomAppId = () =>
  `app-id-${chance()
    .hash()
    .slice(0, 10)}`

export const k8testNamespace = () => `k8test`

function assertOptions(options: SubscribeCreatorOptions): void {
  if (options.appId.length !== randomAppId().length) {
    throw new Error(
      'please use `randomAppId` function for generating the appId. k8s apis expect specific length when we use `appId` to generate k8s resources names.',
    )
  }
}

async function extractNamespaceName(options: {
  appId: string
  apiClient: k8s.CoreV1Api
  watchClient: k8s.Watch
  namespace?: Namespace
}): Promise<string> {
  if (!options.namespace) {
    return 'default'
  }
  switch (options.namespace.namespaceStrategy) {
    case 'default':
      return 'default'
    case 'custom':
      await createNamespaceIfNotExist({
        appId: options.appId,
        apiClient: options.apiClient,
        watchClient: options.watchClient,
        namespaceName: options.namespace.namespace,
      })
      return options.namespace.namespace
    case 'k8test': {
      const namespace = k8testNamespace()
      await createNamespaceIfNotExist({
        appId: options.appId,
        apiClient: options.apiClient,
        watchClient: options.watchClient,
        namespaceName: namespace,
      })
      return namespace
    }
  }
  throw new Error(`enum value is not supported: ${options.namespace.namespaceStrategy}`)
}
