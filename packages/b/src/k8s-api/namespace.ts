import * as k8s from '@kubernetes/client-node'
import { waitUntilNamespaceReady } from './watch-resources'

export async function createNamespaceIfNotExist(options: {
  appId: string
  apiClient: k8s.CoreV1Api
  watchClient: k8s.Watch
  namespaceName: string
}): Promise<k8s.V1Namespace> {
  const namespacesResult = await options.apiClient.listNamespace()
  const namespace = namespacesResult.body.items.find(namespace => namespace.metadata?.name === options.namespaceName)
  if (namespace) {
    await waitUntilNamespaceReady(options.namespaceName, {
      watchClient: options.watchClient,
    })
    return namespace
  }
  const result = await options.apiClient.createNamespace({
    metadata: {
      name: options.namespaceName,
    },
  })
  await waitUntilNamespaceReady(options.namespaceName, {
    watchClient: options.watchClient,
  })
  return result.body
}
