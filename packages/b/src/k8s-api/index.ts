import * as k8s from '@kubernetes/client-node'
import { createService, getUserPort } from './service'
import { createDeployment } from './deployment'

export async function runImage(options: {
  appId: string
  k8sAppsApiClient: k8s.AppsV1Api
  k8sApiClient: k8s.CoreV1Api
  namespaceName: string
  imageName: string
  containerPortToExpose: number
  podPortToExpose: number
}): Promise<{
  deploymentName: string
  serviceName: string
  getDeployedImageUrl: () => Promise<string>
}> {
  const serviceResult = await createService({
    appId: options.appId,
    k8sApiClient: options.k8sApiClient,
    namespaceName: options.namespaceName,
    imageName: options.imageName,
    podPortToExpose: options.podPortToExpose,
  })
  const containerLabels = serviceResult.body.spec?.selector
  if (!containerLabels) {
    throw new Error(
      `failed to create a service for image: ${options.imageName} - container-labels are missing after creating them.`,
    )
  }
  const serviceLabels = serviceResult.body.metadata?.labels
  if (!serviceLabels || Object.keys(serviceLabels).length === 0) {
    throw new Error(
      `failed to create a service for image: ${options.imageName} - service-labels are missing after creating them.`,
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
    k8sAppsApiClient: options.k8sAppsApiClient,
    namespaceName: options.namespaceName,
    imageName: options.imageName,
    containerPortToExpose: options.containerPortToExpose,
    containerLabels,
  })
  const deploymentName = deploymentResult.body.metadata?.name
  if (!deploymentName) {
    throw new Error(
      `failed to create a deployment for image: ${options.imageName} - deployment-name is missing after creating it.`,
    )
  }

  return {
    serviceName,
    deploymentName,
    getDeployedImageUrl: () =>
      getDeployedImageUrl({
        k8sApiClient: options.k8sApiClient,
        namespaceName: options.namespaceName,
        serviceLabelKey: Object.keys(serviceLabels)[0],
      }),
  }
}

async function getDeployedImageUrl(options: {
  k8sApiClient: k8s.CoreV1Api
  namespaceName: string
  serviceLabelKey: string
}): Promise<string> {
  const [address, port] = await Promise.all([
    getMasterAddress({ k8sApiClient: options.k8sApiClient }),
    getUserPort({
      k8sApiClient: options.k8sApiClient,
      namespaceName: options.namespaceName,
      serviceLabelKey: options.serviceLabelKey,
    }),
  ])
  return `http://${address}:${port}`
}

async function getMasterAddress(options: { k8sApiClient: k8s.CoreV1Api }): Promise<string> {
  const response = await options.k8sApiClient.listNode(
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
