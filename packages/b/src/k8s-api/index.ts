import * as k8s from '@kubernetes/client-node'
import { SingletoneStrategy } from '../types'
import { createDeployment, deleteDeployment } from './deployment'
import { createService, deleteService, getDeployedImagePort } from './service'
import { ExposeStrategy } from './types'

export { createeK8sClient } from './k8s-client'
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

export async function deployImageAndExposePort(options: {
  appId: string
  appsApiClient: k8s.AppsV1Api
  apiClient: k8s.CoreV1Api
  watchClient: k8s.Watch
  namespaceName: string
  imageName: string
  containerPortToExpose: number
  exposeStrategy: ExposeStrategy
  singletoneStrategy: SingletoneStrategy
  isReadyPredicate?: (
    deployedImageUrl: string,
    deployedImageAddress: string,
    deployedImagePort: number,
  ) => Promise<void>
}): Promise<DeployedImage> {
  const service = await createService({
    appId: options.appId,
    apiClient: options.apiClient,
    watchClient: options.watchClient,
    namespaceName: options.namespaceName,
    imageName: options.imageName,
    podPortToExpose: options.containerPortToExpose,
    singletoneStrategy: options.singletoneStrategy,
  })
  const containerLabels = service.spec?.selector
  if (!containerLabels) {
    throw new Error(
      `failed to create a service for image: ${options.imageName} - container-labels are missing after creating them.`,
    )
  }
  const serviceName = service.metadata?.name
  if (!serviceName) {
    throw new Error(
      `failed to create a service for image: ${options.imageName} - service-name is missing after creating it.`,
    )
  }
  const deployment = await createDeployment({
    appId: options.appId,
    appsApiClient: options.appsApiClient,
    watchClient: options.watchClient,
    namespaceName: options.namespaceName,
    imageName: options.imageName,
    containerPortToExpose: options.containerPortToExpose,
    containerLabels,
    exposeStrategy: options.exposeStrategy,
    singletoneStrategy: options.singletoneStrategy,
  })
  const deploymentName = deployment.metadata?.name
  if (!deploymentName) {
    throw new Error(
      `failed to create a deployment for image: ${options.imageName} - deployment-name is missing after creating it.`,
    )
  }

  const deployedImageUrl = await getDeployedImageUrl({
    apiClient: options.apiClient,
    namespaceName: options.namespaceName,
    serviceName,
    exposeStrategy: options.exposeStrategy,
  })
  const deployedImageAddress = await getMasterAddress({
    apiClient: options.apiClient,
  })
  const deployedImagePort = await getDeployedImagePort(serviceName, {
    apiClient: options.apiClient,
    namespaceName: options.namespaceName,
    exposeStrategy: options.exposeStrategy,
  })

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

async function waitUntilReady(isReadyPredicate: () => Promise<void>): Promise<void> {
  try {
    return isReadyPredicate()
  } catch {
    await new Promise(res => setTimeout(res, 1000))
    return waitUntilReady(isReadyPredicate)
  }
}

export async function deleteAllImageResources(options: {
  appsApiClient: k8s.AppsV1Api
  apiClient: k8s.CoreV1Api
  watchClient: k8s.Watch
  namespaceName: string
  deploymentName: string
  serviceName: string
  deployedImageUrl: string
}): Promise<void> {
  await deleteService({
    apiClient: options.apiClient,
    watchClient: options.watchClient,
    namespaceName: options.namespaceName,
    serviceName: options.serviceName,
  })
  await deleteDeployment({
    appsApiClient: options.appsApiClient,
    watchClient: options.watchClient,
    namespaceName: options.namespaceName,
    deploymentName: options.deploymentName,
  })
  // k8s has a delay until the deployment is no-longer accessible.
  await new Promise(res => setTimeout(res, 500))
}

export type GetDeployedImageUrl = (options: {
  apiClient: k8s.CoreV1Api
  namespaceName: string
  serviceName: string
  exposeStrategy: ExposeStrategy
}) => Promise<string>

export const getDeployedImageUrl: GetDeployedImageUrl = async options => {
  const [address, port] = await Promise.all([
    getMasterAddress({ apiClient: options.apiClient }),
    getDeployedImagePort(options.serviceName, {
      apiClient: options.apiClient,
      namespaceName: options.namespaceName,
      exposeStrategy: options.exposeStrategy,
    }),
  ])
  return `http://${address}:${port}`
}

export type GetMasterAddress = (options: { apiClient: k8s.CoreV1Api }) => Promise<string>

export const getMasterAddress: GetMasterAddress = async options => {
  const response = await options.apiClient.listNode(
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
