/// <reference path="../../../declarations.d.ts" />

import { SingletonStrategy, ContainerOptions } from './types'
import { addSubscriptionsLabel, createDeployment, deleteDeployment, deleteAllTempDeployments } from './deployment'
import { createService, deleteService, getDeployedImagePort, getServiceIp, deleteAllTempServices } from './service'
import { ExposeStrategy, K8sClient, SubscriptionOperation } from './types'
import k8testLog, { minimal } from 'k8test-log'

export { createK8sClient } from './k8s-client'
export { createNamespaceIfNotExist, deleteNamespaceIfExist, k8testNamespaceName } from './namespace'
export { getDeployedImagePort } from './service'
export { ExposeStrategy, SingletonStrategy, K8sClient, ConnectionFrom } from './types'
export { generateResourceName, randomAppId } from './utils'
export { grantAdminRoleToCluster } from './role'

const log = k8testLog('k8s-api')

export type DeployedImage = {
  deploymentName: string
  serviceName: string
  deployedImageUrl: string
  deployedImageAddress: string
  deployedImagePort: number
}

export type SubscribeToImageOptions = {
  appId?: string
  k8sClient: K8sClient
  namespaceName: string
  imageName: string
  containerPortToExpose: number
  exposeStrategy: ExposeStrategy
  singletonStrategy: SingletonStrategy
  containerOptions?: ContainerOptions
  podStdio?: {
    stdout?: NodeJS.WriteStream
    stderr?: NodeJS.WriteStream
  }
  failFastIfExist?: boolean
}

export async function subscribeToImage(options: SubscribeToImageOptions): Promise<DeployedImage> {
  const logSubs = options.appId ? log.extend(options.appId) : log

  logSubs('subscribing to image "%s" with options: %O', options.imageName, minimal(options))
  const serviceResult = await createService({
    appId: options.appId,
    k8sClient: options.k8sClient,
    namespaceName: options.namespaceName,
    imageName: options.imageName,
    podPortToExpose: options.containerPortToExpose,
    singletonStrategy: options.singletonStrategy,
    failFastIfExist: options.failFastIfExist,
  })
  const podLabels = serviceResult.resource.spec?.selector
  if (!podLabels) {
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
  logSubs(`${serviceResult.isNewResource ? 'created' : 'using existing'} service to image "%s"`, options.imageName)

  const deploymentResult = await createDeployment({
    appId: options.appId,
    k8sClient: options.k8sClient,
    namespaceName: options.namespaceName,
    imageName: options.imageName,
    containerPortToExpose: options.containerPortToExpose,
    podLabels,
    exposeStrategy: options.exposeStrategy,
    singletonStrategy: options.singletonStrategy,
    containerOptions: options.containerOptions,
    podStdio: options.podStdio,
    failFastIfExist: options.failFastIfExist,
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
  logSubs(
    `${deploymentResult.isNewResource ? 'created' : 'using existing'} deployment to image "%s"`,
    options.imageName,
  )

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

  logSubs(
    'subscribed to image "%s". address of the container: "%s"',
    options.imageName,
    `${deployedImageAddress}:${deployedImagePort}`,
  )

  return {
    serviceName,
    deploymentName,
    deployedImageUrl,
    deployedImageAddress,
    deployedImagePort,
  }
}

export type UnsubscribeFromImageOptions = {
  appId: string
  imageName: string
  k8sClient: K8sClient
  namespaceName: string
  deploymentName: string
  serviceName: string
  deployedImageUrl: string
  singletonStrategy: SingletonStrategy
}

export async function unsubscribeFromImage(options: UnsubscribeFromImageOptions): Promise<void> {
  const logUnsubs = log.extend(options.appId)

  logUnsubs('unsubscribing from image "%s" with options: %O', options.imageName, minimal(options))
  const deleteResources = async () => {
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
    logUnsubs('the image "%s" deleted', options.imageName)
  }
  if ([SingletonStrategy.oneInAppId, SingletonStrategy.manyInAppId].includes(options.singletonStrategy)) {
    const updatedBalance = await addSubscriptionsLabel(options.deploymentName, {
      k8sClient: options.k8sClient,
      namespaceName: options.namespaceName,
      operation: SubscriptionOperation.unsubscribe,
    })
    if (updatedBalance === 0) {
      await deleteResources()
    } else {
      logUnsubs('the image "%s" still has %d subscribers so it is still needed', options.imageName, updatedBalance)
    }
  } else {
    logUnsubs('the image "%s" will not be deleted because it is a singleton-cluster resource', options.imageName)
  }
}

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
  log('deleting all temp-resources in namespace: "%s"', namespaceName)
  await deleteAllTempServices({ k8sClient, namespaceName })
  await deleteAllTempDeployments({ k8sClient, namespaceName })
  log('deleted all temp-resources in namespace: "%s"', namespaceName)
}
