import * as k8s from '@kubernetes/client-node'

export async function createNamespace(options: { appId: string; k8sApiClient: k8s.CoreV1Api; namespaceName: string }) {
  return options.k8sApiClient.createNamespace({
    metadata: {
      name: options.namespaceName,
    },
  })
}

export async function deleteNamespace(options: { appId: string; k8sApiClient: k8s.CoreV1Api; namespaceName: string }) {
  return options.k8sApiClient.deleteNamespace(options.namespaceName)
}
