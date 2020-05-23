import * as k8s from '@kubernetes/client-node'
import { isResourceAlreadyExistError } from './utils'
import { waitUntilNamespaceCreated, waitUntilNamespaceDeleted } from './watch-resources'

// synchromized operation to create a new namespace in k8s
export async function createNamespaceIfNotExist(options: {
  appId: string
  apiClient: k8s.CoreV1Api
  watchClient: k8s.Watch
  namespaceName: string
}): Promise<k8s.V1Namespace> {
  try {
    await options.apiClient.createNamespace({
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
    watchClient: options.watchClient,
  })
}

export async function deleteNamespaceIfExist(options: {
  appId: string
  apiClient: k8s.CoreV1Api
  watchClient: k8s.Watch
  namespaceName: string
}): Promise<void> {
  const namespacesResult = await options.apiClient.listNamespace()
  const namespace = namespacesResult.body.items.find(namespace => namespace.metadata?.name === options.namespaceName)
  if (namespace) {
    await options.apiClient.deleteNamespace(options.namespaceName)
    await waitUntilNamespaceDeleted(options.namespaceName, {
      watchClient: options.watchClient,
    })
  }
}
