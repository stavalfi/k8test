import * as k8s from '@kubernetes/client-node'
import { isResourceAlreadyExistError } from './utils'
import { waitUntilNamespaceCreated, waitUntilNamespaceDeleted } from './watch-resources'
import { K8sClient } from './types'

export const defaultK8testNamespaceName = () => `k8test`

export async function createNamespaceIfNotExist(options: {
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

export async function deleteNamespaceIf(options: {
  k8sClient: K8sClient
  predicate: (namespaceName: string) => boolean
}): Promise<void> {
  const namespacesResult = await options.k8sClient.apiClient.listNamespace()
  const namespaces = namespacesResult.body.items
    .map(namespace => namespace.metadata?.name)
    .filter(Boolean)
    // @ts-ignore
    .filter(options.predicate) as string[]

  await Promise.all(namespaces.map(namespaceName => options.k8sClient.apiClient.deleteNamespace(namespaceName)))
  await Promise.all(
    namespaces.map(namespaceName =>
      waitUntilNamespaceDeleted(namespaceName, {
        k8sClient: options.k8sClient,
      }),
    ),
  )
}
