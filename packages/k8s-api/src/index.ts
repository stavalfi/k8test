/// <reference path="../../../declarations.d.ts" />

import k8testLog, { minimal } from 'k8test-log'
import { addSubscriptionsLabel, createDeployment, deleteDeployment, deleteDeploymentIf } from './deployment'
import { createService, deleteService, deleteServiceIf, getDeployedImagePort, getServiceIp } from './service'
import {
  ContainerOptions,
  ExposeStrategy,
  K8sClient,
  K8sResource,
  SingletonStrategy,
  SubscriptionOperation,
} from './types'
import { generateResourceName, generateResourceLabels } from './utils'

export { NotFoundError } from './errors'
export { createK8sClient } from './k8s-client'
export { createNamespaceIfNotExist, defaultK8testNamespaceName, deleteNamespaceIf } from './namespace'
export { deleteRolesIf, grantAdminRoleToCluster } from './role'
export { getDeployedImagePort } from './service'
export { ConnectionFrom, ExposeStrategy, K8sClient, SingletonStrategy } from './types'
export { generateResourceName, isTempResource, randomAppId, generateResourceLabels } from './utils'
export { attach } from './attach'

const log = k8testLog('k8s-api')

export type DeployedImage = {
  serviceName: string
  deploymentName: string
  deployedImageUrl: string
  deployedImageIp: string
  deployedImagePort: number
}

export type SubscribeToImageOptions = {
  k8sClient: K8sClient
} & SerializedSubscribeToImageOptions

export type SerializedSubscribeToImageOptions = {
  appId?: string
  namespaceName: string
  imageName: string
  postfix?: string
  imagePort: number
  exposeStrategy: ExposeStrategy
  singletonStrategy: SingletonStrategy
  containerOptions?: ContainerOptions
}

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

export async function getDeployedImageConnectionDetails(options: {
  k8sClient: K8sClient
  namespaceName: string
  exposeStrategy: ExposeStrategy
  serviceName: string
}) {
  const [deployedImageIp, deployedImagePort] = await Promise.all([
    options.exposeStrategy === ExposeStrategy.userMachine
      ? getMasterIp({ k8sClient: options.k8sClient })
      : getServiceIp(options.serviceName, { k8sClient: options.k8sClient, namespaceName: options.namespaceName }),
    getDeployedImagePort(options.serviceName, {
      k8sClient: options.k8sClient,
      namespaceName: options.namespaceName,
      exposeStrategy: options.exposeStrategy,
    }),
  ])

  const deployedImageUrl = `http://${deployedImageIp}:${deployedImagePort}`
  return { deployedImageIp, deployedImagePort, deployedImageUrl }
}

export async function subscribeToImage(options: SubscribeToImageOptions): Promise<DeployedImage> {
  const resourcesName = generateResourceName({
    namespaceName: options.namespaceName,
    singletonStrategy: options.singletonStrategy,
    appId: options.appId,
    imageName: options.imageName,
    postfix: options.postfix,
  })

  const resourcesLabels = generateResourceLabels({
    appId: options.appId,
    imageName: options.imageName,
    singletonStrategy: options.singletonStrategy,
    postfix: options.postfix,
  })

  const serviceResult = await createService({
    appId: options.appId,
    k8sClient: options.k8sClient,
    namespaceName: options.namespaceName,
    imageName: options.imageName,
    podPortToExpose: options.imagePort,
    singletonStrategy: options.singletonStrategy,
    serviceName: resourcesName,
    serviceLabels: resourcesLabels,
  })

  const deploymentResult = await createDeployment({
    appId: options.appId,
    k8sClient: options.k8sClient,
    namespaceName: options.namespaceName,
    imageName: options.imageName,
    imagePort: options.imagePort,
    podLabels: resourcesLabels,
    exposeStrategy: options.exposeStrategy,
    singletonStrategy: options.singletonStrategy,
    containerOptions: options.containerOptions,
    deploymentName: resourcesName,
    deploymentLabels: resourcesLabels,
  })

  if (serviceResult.isNewResource !== deploymentResult.isNewResource) {
    throw new Error(
      `k8test detected inconsistent cluster state. some resources that k8test created were deleted (manually?). please remove all k8test resources. if it's allocated on namespace "k8test", please run the following command and start what you were doing again: "kubectl delete namespace k8test"`,
    )
  }

  if (!deploymentResult.isNewResource) {
    await addSubscriptionsLabel(resourcesName, {
      k8sClient: options.k8sClient,
      namespaceName: options.namespaceName,
      operation: SubscriptionOperation.subscribe,
    })
  }

  const { deployedImageIp, deployedImagePort, deployedImageUrl } = await getDeployedImageConnectionDetails({
    k8sClient: options.k8sClient,
    exposeStrategy: options.exposeStrategy,
    namespaceName: options.namespaceName,
    serviceName: resourcesName,
  })

  log(
    'subscribed to resource "%s". resource is reachable through: "%s"',
    resourcesName,
    `${deployedImageIp}:${deployedImagePort}`,
  )

  return {
    deploymentName: resourcesName,
    serviceName: resourcesName,
    deployedImageUrl,
    deployedImageIp,
    deployedImagePort,
  }
}

export type UnsubscribeFromImageOptions = {
  appId?: string
  imageName: string
  k8sClient: K8sClient
  namespaceName: string
  deploymentName: string
  serviceName: string
  singletonStrategy: SingletonStrategy
  forceDelete?: boolean
}

export async function unsubscribeFromImage(options: UnsubscribeFromImageOptions): Promise<void> {
  const logUnsubs = options.appId ? log.extend(options.appId) : log

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
  if (options.forceDelete) {
    return deleteResources()
  } else {
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
}

export type GetMasterAddress = (options: { k8sClient: K8sClient }) => Promise<string>

export async function deleteResourceIf({
  k8sClient,
  namespaceName,
  predicate,
}: {
  k8sClient: K8sClient
  namespaceName: string
  predicate: (resource: K8sResource) => boolean
}) {
  log('deleting all resources in namespace: "%s" by predicate', namespaceName)
  await deleteServiceIf({ k8sClient, namespaceName, predicate })
  await deleteDeploymentIf({ k8sClient, namespaceName, predicate })
  log('deleted all resources in namespace: "%s" by predicate', namespaceName)
}
