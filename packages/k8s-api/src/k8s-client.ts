/* eslint-disable no-console */
import * as k8s from '@kubernetes/client-node'
import { K8sClient } from './types'

export enum ConnectFrom {
  insideCluster = 'inside the cluster',
  outsideCluster = 'outside the cluster',
}

export const createK8sClient = (connectFrom: ConnectFrom): K8sClient => {
  const kc = new k8s.KubeConfig()

  switch (connectFrom) {
    case ConnectFrom.insideCluster:
      kc.loadFromCluster()
      break
    case ConnectFrom.outsideCluster:
      kc.loadFromDefault()
      break
  }

  const authClient = kc.makeApiClient(k8s.RbacAuthorizationV1Api)
  const apiClient = kc.makeApiClient(k8s.CoreV1Api)
  const appsApiClient = kc.makeApiClient(k8s.AppsV1Api)
  const watchClient = new k8s.Watch(kc)

  return { authClient, apiClient, appsApiClient, watchClient }
}
