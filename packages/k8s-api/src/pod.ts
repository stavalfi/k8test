import * as k8s from '@kubernetes/client-node'
import { K8sClient, Labels } from './types'
import objectDeepContain from 'object-deep-contain'

export async function findPodByLabels(options: {
  k8sClient: K8sClient
  namespaceName: string
  podLabels: Labels
}): Promise<k8s.V1Pod> {
  const pods = await options.k8sClient.apiClient.listNamespacedPod(options.namespaceName)
  const pod = pods.body.items.find(pod => objectDeepContain(pod.metadata?.labels, options.podLabels))
  if (!pod) {
    throw new Error(`pod with the following labels is not found: ${JSON.stringify(options.podLabels, null, 2)}`)
  }
  return pod
}
