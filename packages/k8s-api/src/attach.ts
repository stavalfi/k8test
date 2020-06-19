import { K8sClient, SingletonStrategy } from './types'
import { findPodByLabels } from './pod'
import { generateResourceLabels } from './utils'
import WebSocket from 'ws'

export async function attach(options: {
  k8sClient: K8sClient
  namespaceName: string
  appId?: string
  imageName: string
  singletonStrategy: SingletonStrategy
}): Promise<WebSocket> {
  const pod = await findPodByLabels({
    k8sClient: options.k8sClient,
    namespaceName: options.namespaceName,
    podLabels: generateResourceLabels({
      appId: options.appId,
      imageName: options.imageName,
      singletonStrategy: options.singletonStrategy,
    }),
  })

  const podName = pod.metadata?.name
  const containerName = pod.spec?.containers?.[0].name

  if (!podName || !containerName) {
    throw new Error(`could not found container and pod names to attach to`)
  }

  return options.k8sClient.attach.attach(
    options.namespaceName,
    podName,
    containerName,
    process.stdout,
    process.stderr,
    null,
    false,
  )
}
