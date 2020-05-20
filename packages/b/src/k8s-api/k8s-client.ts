/* eslint-disable no-console */
import * as k8s from '@kubernetes/client-node'

export const createeK8sClient = () => {
  const kc = new k8s.KubeConfig()
  kc.loadFromDefault()

  const k8sApiClient = kc.makeApiClient(k8s.CoreV1Api)
  const k8sAppsApiClient = kc.makeApiClient(k8s.AppsV1Api)

  return { k8sApiClient, k8sAppsApiClient }
}
