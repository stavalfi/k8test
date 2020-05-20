import * as k8s from '@kubernetes/client-node'
import { waitUntilNamespaceCreated, waitUntilNamespaceDeleted } from './watch-resources'

export async function createNamespaceIfNotExist(options: {
  appId: string
  apiClient: k8s.CoreV1Api
  watchClient: k8s.Watch
  namespaceName: string
}): Promise<k8s.V1Namespace> {
  const namespacesResult = await options.apiClient.listNamespace()
  const namespace = namespacesResult.body.items.find(namespace => namespace.metadata?.name === options.namespaceName)
  if (namespace) {
    await waitUntilNamespaceCreated(options.namespaceName, {
      watchClient: options.watchClient,
    })
    return namespace
  }
  const result = await options.apiClient.createNamespace({
    metadata: {
      name: options.namespaceName,
    },
  })
  await waitUntilNamespaceCreated(options.namespaceName, {
    watchClient: options.watchClient,
  })
  return result.body
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
