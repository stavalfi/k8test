import { SingletonStrategy } from './types'
import { addSubscriptionsLabel, createDeployment, deleteDeployment, deleteAllTempDeployments } from './deployment'
import { createService, deleteService, getDeployedImagePort, getServiceIp, deleteAllTempServices } from './service'
import { ExposeStrategy, K8sClient, SubscriptionOperation } from './types'
import chance from 'chance'

export { createK8sClient } from './k8s-client'
export { createNamespaceIfNotExist, deleteNamespaceIfExist, k8testNamespaceName } from './namespace'
export { getDeployedImagePort } from './service'
export { ExposeStrategy, SingletonStrategy, K8sClient } from './types'

export type DeployedImage = {
  deploymentName: string
  serviceName: string
  deployedImageUrl: string
  deployedImageAddress: string
  deployedImagePort: number
}

export type SubscribeToImageOptions = {
  appId: string
  k8sClient: K8sClient
  namespaceName: string
  imageName: string
  containerPortToExpose: number
  exposeStrategy: ExposeStrategy
  singletonStrategy: SingletonStrategy
}

export async function subscribeToImage(options: SubscribeToImageOptions): Promise<DeployedImage> {
  const serviceResult = await createService({
    appId: options.appId,
    k8sClient: options.k8sClient,
    namespaceName: options.namespaceName,
    imageName: options.imageName,
    podPortToExpose: options.containerPortToExpose,
    singletonStrategy: options.singletonStrategy,
  })
  const containerLabels = serviceResult.resource.spec?.selector
  if (!containerLabels) {
    throw new Error(
      `failed to create a service for image: ${options.imageName} - container-labels are missing after creating them.`,
    )
  }
  const serviceName = serviceResult.resource.metadata?.name
  if (!serviceName) {
    throw new Error(
      `failed to create a service for image: ${options.imageName} - service-name is missing after creating it.`,
    )
  }
  const deploymentResult = await createDeployment({
    appId: options.appId,
    k8sClient: options.k8sClient,
    namespaceName: options.namespaceName,
    imageName: options.imageName,
    containerPortToExpose: options.containerPortToExpose,
    containerLabels,
    exposeStrategy: options.exposeStrategy,
    singletonStrategy: options.singletonStrategy,
  })
  const deploymentName = deploymentResult.resource.metadata?.name
  if (!deploymentName) {
    throw new Error(
      `failed to create a deployment for image: ${options.imageName} - deployment-name is missing after creating it.`,
    )
  }

  if (serviceResult.isNewResource !== deploymentResult.isNewResource) {
    throw new Error(
      `k8test detected inconsistent cluster state. some resources that k8test created were deleted (manually?). please remove all k8test resources. if it's allocated on namespace "k8test", please run the following command and start what you were doing again: "kubectl delete namespace k8test"`,
    )
  }

  if (!deploymentResult.isNewResource) {
    await addSubscriptionsLabel(deploymentName, {
      k8sClient: options.k8sClient,
      namespaceName: options.namespaceName,
      operation: SubscriptionOperation.subscribe,
    })
  }

  const [deployedImageAddress, deployedImagePort] = await Promise.all([
    options.exposeStrategy === ExposeStrategy.userMachine
      ? getMasterIp({ k8sClient: options.k8sClient })
      : getServiceIp(serviceName, { k8sClient: options.k8sClient, namespaceName: options.namespaceName }),
    getDeployedImagePort(serviceName, {
      k8sClient: options.k8sClient,
      namespaceName: options.namespaceName,
      exposeStrategy: options.exposeStrategy,
    }),
  ])

  const deployedImageUrl = `http://${deployedImageAddress}:${deployedImagePort}`

  return {
    serviceName,
    deploymentName,
    deployedImageUrl,
    deployedImageAddress,
    deployedImagePort,
  }
}

export type UnsubscribeFromImageOptions = {
  k8sClient: K8sClient
  namespaceName: string
  deploymentName: string
  serviceName: string
  deployedImageUrl: string
  singletonStrategy: SingletonStrategy
}

export async function unsubscribeFromImage(options: UnsubscribeFromImageOptions): Promise<void> {
  if ([SingletonStrategy.oneInAppId, SingletonStrategy.manyInAppId].includes(options.singletonStrategy)) {
    const updatedBalance = await addSubscriptionsLabel(options.deploymentName, {
      k8sClient: options.k8sClient,
      namespaceName: options.namespaceName,
      operation: SubscriptionOperation.unsubscribe,
    })
    if (updatedBalance === 0) {
      await deleteService({
        k8sClient: options.k8sClient,
        namespaceName: options.namespaceName,
        serviceName: options.serviceName,
      })
      await deleteDeployment({
        k8sClient: options.k8sClient,
        namespaceName: options.namespaceName,
        deploymentName: options.deploymentName,
      })
      // k8s has a delay until the deployment is no-longer accessible.
      await new Promise(res => setTimeout(res, 3000))
    }
  }
}

export const randomAppId = () =>
  `app-id-${chance()
    .hash()
    .slice(0, 10)}`

export const internalK8testResourcesAppId = () => 'app-id-internal-k8test-resources'

export type GetMasterAddress = (options: { k8sClient: K8sClient }) => Promise<string>

export const getMasterIp: GetMasterAddress = async options => {
  const response = await options.k8sClient.apiClient.listNode(
    undefined,
    false,
    undefined,
    undefined,
    'node-role.kubernetes.io/master',
  )
  const items = response.body.items
  if (items.length !== 1) {
    throw new Error('could not find a single master-node to extract its address')
  }
  const result = items[0].status?.addresses?.find(address => address.type === 'InternalIP')
  if (!result?.address) {
    throw new Error(`could not find the address of the master node. master node: ${JSON.stringify(items[0], null, 0)}`)
  }
  return result.address
}

export async function deleteAllTempResources({
  k8sClient,
  namespaceName,
}: {
  k8sClient: K8sClient
  namespaceName: string
}) {
  await deleteAllTempServices({ k8sClient, namespaceName })
  await deleteAllTempDeployments({ k8sClient, namespaceName })
}
