import { SingletonStrategy } from '../types'
import { addSubscriptionsLabel, createDeployment, deleteDeployment } from './deployment'
import { createService, deleteService, getDeployedImagePort } from './service'
import { ExposeStrategy, K8sClient, SubscriptionOperation } from './types'

export { createK8sClient } from './k8s-client'
export { createNamespaceIfNotExist, deleteNamespaceIfExist } from './namespace'
export { getDeployedImagePort } from './service'
export { ExposeStrategy } from './types'

export type DeployedImage = {
  deploymentName: string
  serviceName: string
  deployedImageUrl: string
  deployedImageAddress: string
  deployedImagePort: number
}

export async function subscribeToImage(options: {
  appId: string
  k8sClient: K8sClient
  namespaceName: string
  imageName: string
  containerPortToExpose: number
  exposeStrategy: ExposeStrategy
  singletonStrategy: SingletonStrategy
  isReadyPredicate?: (
    deployedImageUrl: string,
    deployedImageAddress: string,
    deployedImagePort: number,
  ) => Promise<void>
}): Promise<DeployedImage> {
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

  const deployedImageUrl = await getDeployedImageUrl({
    k8sClient: options.k8sClient,
    namespaceName: options.namespaceName,
    serviceName,
    exposeStrategy: options.exposeStrategy,
  })
  const deployedImageAddress = await getMasterAddress({
    k8sClient: options.k8sClient,
  })
  const deployedImagePort = await getDeployedImagePort(serviceName, {
    k8sClient: options.k8sClient,
    namespaceName: options.namespaceName,
    exposeStrategy: options.exposeStrategy,
  })

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

  const { isReadyPredicate } = options
  if (isReadyPredicate) {
    await waitUntilReady(() => isReadyPredicate(deployedImageUrl, deployedImageAddress, deployedImagePort))
  }

  return {
    serviceName,
    deploymentName,
    deployedImageUrl,
    deployedImageAddress,
    deployedImagePort,
  }
}

export async function unsubscribeFromImage(options: {
  k8sClient: K8sClient
  namespaceName: string
  deploymentName: string
  serviceName: string
  deployedImageUrl: string
  singletonStrategy: SingletonStrategy
}): Promise<void> {
  if ([SingletonStrategy.appId, SingletonStrategy.many].includes(options.singletonStrategy)) {
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

export type GetDeployedImageUrl = (options: {
  k8sClient: K8sClient
  namespaceName: string
  serviceName: string
  exposeStrategy: ExposeStrategy
}) => Promise<string>

export const getDeployedImageUrl: GetDeployedImageUrl = async options => {
  const [address, port] = await Promise.all([
    getMasterAddress({ k8sClient: options.k8sClient }),
    getDeployedImagePort(options.serviceName, {
      k8sClient: options.k8sClient,
      namespaceName: options.namespaceName,
      exposeStrategy: options.exposeStrategy,
    }),
  ])
  return `http://${address}:${port}`
}

export type GetMasterAddress = (options: { k8sClient: K8sClient }) => Promise<string>

export const getMasterAddress: GetMasterAddress = async options => {
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
