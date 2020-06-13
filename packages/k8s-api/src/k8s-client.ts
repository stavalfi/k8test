/* eslint-disable no-console */
import * as k8s from '@kubernetes/client-node'
import { K8sClient, ConnectionFrom } from './types'

export const createK8sClient = (connectFrom: ConnectionFrom): K8sClient => {
  const kc = new k8s.KubeConfig()

  switch (connectFrom) {
    case ConnectionFrom.insideCluster:
      kc.loadFromCluster()
      break
    case ConnectionFrom.outsideCluster:
      kc.loadFromDefault()
      break
  }

  const authClient = kc.makeApiClient(k8s.RbacAuthorizationV1Api)
  const apiClient = kc.makeApiClient(k8s.CoreV1Api)
  const appsApiClient = kc.makeApiClient(k8s.AppsV1Api)
  const watchClient = new k8s.Watch(kc)
  const attach = new k8s.Attach(kc)

  return { authClient, apiClient, appsApiClient, watchClient, attach, connectedFrom: connectFrom }
}
