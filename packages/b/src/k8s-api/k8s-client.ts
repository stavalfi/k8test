/* eslint-disable no-console */
import * as k8s from '@kubernetes/client-node'

export const createeK8sClient = () => {
  const kc = new k8s.KubeConfig()
  kc.loadFromDefault()

  const apiClient = kc.makeApiClient(k8s.CoreV1Api)
  const appsApiClient = kc.makeApiClient(k8s.AppsV1Api)
  const watchClient = new k8s.Watch(kc)

  return { apiClient, appsApiClient, watchClient }
}
