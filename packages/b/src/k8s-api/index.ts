import * as k8s from '@kubernetes/client-node'
import { createDeployment, deleteDeployment, ExposeStrategy } from './deployment'
import { createService, deleteService, getDeployedImagePort } from './service'

export { createeK8sClient } from './k8s-client'
export { createNamespaceIfNotExist, deleteNamespaceIfExist } from './namespace'
export { generateDeploymentName, isDeploymentExist, ExposeStrategy } from './deployment'
export { generateServicetName, getDeployedImagePort } from './service'

export type DeployedImage = {
  deploymentName: string
  serviceName: string
  getDeployedImageUrl: () => Promise<string>
  getDeployedImageAddress: () => Promise<string>
  getDeployedImagePort: () => Promise<number>
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
  isReadyPredicate?: (
    deployedImageUrl: string,
    deployedImageAddress: string,
    deployedImagePort: number,
  ) => Promise<void>
}): Promise<DeployedImage> {
  const serviceResult = await createService({
    appId: options.appId,
    apiClient: options.apiClient,
    watchClient: options.watchClient,
    namespaceName: options.namespaceName,
    imageName: options.imageName,
    podPortToExpose: options.containerPortToExpose,
  })
  const containerLabels = serviceResult.body.spec?.selector
  if (!containerLabels) {
    throw new Error(
      `failed to create a service for image: ${options.imageName} - container-labels are missing after creating them.`,
    )
  }
  const serviceName = serviceResult.body.metadata?.name
  if (!serviceName) {
    throw new Error(
      `failed to create a service for image: ${options.imageName} - service-name is missing after creating it.`,
    )
  }
  const deploymentResult = await createDeployment({
    appId: options.appId,
    appsApiClient: options.appsApiClient,
    watchClient: options.watchClient,
    namespaceName: options.namespaceName,
    imageName: options.imageName,
    containerPortToExpose: options.containerPortToExpose,
    containerLabels,
    exposeStrategy: options.exposeStrategy,
  })
  const deploymentName = deploymentResult.body.metadata?.name
  if (!deploymentName) {
    throw new Error(
      `failed to create a deployment for image: ${options.imageName} - deployment-name is missing after creating it.`,
    )
  }

  const result: DeployedImage = {
    serviceName,
    deploymentName,
    getDeployedImageUrl: () =>
      getDeployedImageUrl({
        apiClient: options.apiClient,
        namespaceName: options.namespaceName,
        serviceName,
      }),
    getDeployedImageAddress: () =>
      getMasterAddress({
        apiClient: options.apiClient,
      }),
    getDeployedImagePort: () =>
      getDeployedImagePort(serviceName, {
        apiClient: options.apiClient,
        namespaceName: options.namespaceName,
      }),
  }

  if (options.isReadyPredicate) {
    const url = await result.getDeployedImageUrl()
    const host = await result.getDeployedImageAddress()
    const port = await result.getDeployedImagePort()
    const { isReadyPredicate } = options
    await waitUntilReady(() => isReadyPredicate(url, host, port))
  }

  return result
}

async function waitUntilReady(isReadyPredicate: () => Promise<void>) {
  try {
    await isReadyPredicate()
    return
  } catch {
    await new Promise(res => setTimeout(res, 1000))
    waitUntilReady(isReadyPredicate)
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
}) => Promise<string>

export const getDeployedImageUrl: GetDeployedImageUrl = async options => {
  const [address, port] = await Promise.all([
    getMasterAddress({ apiClient: options.apiClient }),
    getDeployedImagePort(options.serviceName, {
      apiClient: options.apiClient,
      namespaceName: options.namespaceName,
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
