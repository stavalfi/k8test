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

export type K8sClient = {
  apiClient: k8s.CoreV1Api
  appsApiClient: k8s.AppsV1Api
  watchClient: k8s.Watch
}

export enum SingletonStrategy {
  many = 'many-per-app-id', // (default) always new container
  namespace = 'one-per-namespace', // one instance per namespace - e.g. k8test-internal-redis
  appId = 'one-per-app-id', // one instance per appId - e.g. user images
}

export type K8sResource = k8s.V1Service | k8s.V1Deployment | k8s.V1beta1CronJob | k8s.V1Namespace
