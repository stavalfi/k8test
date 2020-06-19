import * as k8s from '@kubernetes/client-node'

export type Labels = { [key: string]: string }

export enum ExposeStrategy {
  insideCluster = 'insideCluster',
  userMachine = 'userMachine',
}

export enum SubscriptionOperation {
  subscribe = 'subscribe',
  unsubscribe = 'unsubscribe',
}

export enum ConnectionFrom {
  insideCluster = 'inside the cluster',
  outsideCluster = 'outside the cluster',
}

export type K8sClient = {
  authClient: k8s.RbacAuthorizationV1Api
  apiClient: k8s.CoreV1Api
  appsApiClient: k8s.AppsV1Api
  watchClient: k8s.Watch
  attach: k8s.Attach
  connectedFrom: ConnectionFrom
}

export enum SingletonStrategy {
  manyInAppId = 'many-in-app-id',
  oneInNamespace = 'one-in-namespace',
  oneInAppId = 'one-in-app-id',
}

export type K8sResource =
  | k8s.V1Service
  | k8s.V1Deployment
  | k8s.V1beta1CronJob
  | k8s.V1Namespace
  | k8s.V1Pod
  | k8s.V1Role
  | k8s.V1RoleBinding
  | k8s.V1ClusterRole
  | k8s.V1ClusterRoleBinding

export type ContainerOptions = Omit<k8s.V1Container, 'name' | 'image' | 'ports'>
