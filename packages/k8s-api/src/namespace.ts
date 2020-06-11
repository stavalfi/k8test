import * as k8s from '@kubernetes/client-node'
import { isResourceAlreadyExistError } from './utils'
import { waitUntilNamespaceCreated, waitUntilNamespaceDeleted } from './watch-resources'
import { K8sClient } from './types'

export const k8testNamespaceName = () => `k8test`

export async function createNamespaceIfNotExist(options: {
  appId: string
  k8sClient: K8sClient
  namespaceName: string
}): Promise<k8s.V1Namespace> {
  try {
    await options.k8sClient.apiClient.createNamespace({
      metadata: {
        name: options.namespaceName,
      },
    })
  } catch (error) {
    if (!isResourceAlreadyExistError(error)) {
      throw error
    }
  }
  return waitUntilNamespaceCreated(options.namespaceName, {
    k8sClient: options.k8sClient,
  })
}

export async function deleteNamespaceIfExist(options: { k8sClient: K8sClient; namespaceName: string }): Promise<void> {
  const namespacesResult = await options.k8sClient.apiClient.listNamespace()
  const namespace = namespacesResult.body.items.find(namespace => namespace.metadata?.name === options.namespaceName)
  if (namespace) {
    await options.k8sClient.apiClient.deleteNamespace(options.namespaceName)
    await waitUntilNamespaceDeleted(options.namespaceName, {
      k8sClient: options.k8sClient,
    })
  }
}
