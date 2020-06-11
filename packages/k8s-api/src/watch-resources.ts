import * as k8s from '@kubernetes/client-node'
import { timeout } from './utils'
import _omit from 'lodash/omit'
import { K8sClient, K8sResource } from './types'

enum ResourceEventType {
  resourceAdded = 'ADDED',
  resourceModified = 'MODIFIED',
  resourceDeleted = 'DELETED',
}

export const waitUntilNamespaceCreated = (namespaceName: string, options: { k8sClient: K8sClient }) =>
  waitForResource<k8s.V1Namespace>({
    k8sClient: options.k8sClient,
    api: `/api/v1/namespaces`,
    resourceName: namespaceName,
    predicate: resourceEventType => resourceEventType === ResourceEventType.resourceAdded,
  })

export const waitUntilNamespaceDeleted = (namespaceName: string, options: { k8sClient: K8sClient }) =>
  waitForResource<k8s.V1Namespace>({
    k8sClient: options.k8sClient,
    api: `/api/v1/namespaces`,
    resourceName: namespaceName,
    predicate: resourceEventType => resourceEventType === ResourceEventType.resourceDeleted,
  })

export const waitUntilDeploymentReady = (
  deploymentName: string,
  options: { k8sClient: K8sClient; namespaceName: string },
) =>
  waitForResource<k8s.V1Deployment>({
    k8sClient: options.k8sClient,
    api: `/apis/apps/v1/namespaces/${options.namespaceName}/deployments`,
    resourceName: deploymentName,
    namespaceName: options.namespaceName,
    predicate: (resourceEventType, deployment) =>
      (resourceEventType === ResourceEventType.resourceAdded ||
        resourceEventType === ResourceEventType.resourceModified) &&
      deployment.status?.readyReplicas === deployment.status?.availableReplicas &&
      deployment.status?.readyReplicas === deployment.status?.replicas &&
      deployment.status?.replicas === deployment.spec?.replicas,
  })

export const waitUntilDeploymentDeleted = (
  deploymentName: string,
  options: { k8sClient: K8sClient; namespaceName: string },
) =>
  waitForResource<k8s.V1Deployment>({
    k8sClient: options.k8sClient,
    api: `/apis/apps/v1/namespaces/${options.namespaceName}/deployments`,
    resourceName: deploymentName,
    namespaceName: options.namespaceName,
    predicate: resourceEventType => resourceEventType === ResourceEventType.resourceDeleted,
  })

export const waitUntilServiceCreated = (
  serviceName: string,
  options: { k8sClient: K8sClient; namespaceName: string },
) =>
  waitForResource<k8s.V1Service>({
    k8sClient: options.k8sClient,
    api: `/api/v1/namespaces/${options.namespaceName}/services`,
    resourceName: serviceName,
    namespaceName: options.namespaceName,
    predicate: resourceEventType => resourceEventType === ResourceEventType.resourceAdded,
  })

export const waitUntilServiceDeleted = (
  serviceName: string,
  options: { k8sClient: K8sClient; namespaceName: string },
) =>
  waitForResource<k8s.V1Service>({
    k8sClient: options.k8sClient,
    api: `/api/v1/namespaces/${options.namespaceName}/services`,
    resourceName: serviceName,
    namespaceName: options.namespaceName,
    predicate: resourceEventType => resourceEventType === ResourceEventType.resourceDeleted,
  })

async function waitForResource<Resource extends K8sResource>(options: {
  k8sClient: K8sClient
  api: string
  resourceName: string
  debug?: boolean
  namespaceName?: string
  predicate: (resourceEventType: ResourceEventType, resource: Resource) => boolean
}): Promise<Resource> {
  let watchResult: { abort: () => void }
  const TIMEOUT = 60_000
  return timeout(
    new Promise<Resource>((res, rej) => {
      options.k8sClient.watchClient
        .watch(
          options.api,
          {},
          (type, obj) => {
            const resource = obj as Resource
            if (options.debug) {
              // eslint-disable-next-line no-console
              console.log(type, JSON.stringify(resource, null, 2))
            }
            if (
              (!('namespaceName' in options) || options.namespaceName === resource.metadata?.namespace) &&
              resource.metadata?.name === options.resourceName
            ) {
              if (options.predicate(type as ResourceEventType, resource)) {
                return res(resource)
              }
            }
          },
          err => (err ? rej(err) : rej('resource not found')),
        )
        .then(_watchResult => (watchResult = _watchResult))
    }),
    TIMEOUT,
  )
    .catch(e =>
      e === 'timeout'
        ? Promise.reject(
            `timeout: resource not found or did not meet the predicate. params: ${JSON.stringify(
              _omit(options, ['watchClient']),
              null,
              2,
            )}.`,
          )
        : Promise.reject(e),
    )
    .finally(async () => {
      if (watchResult) {
        watchResult.abort()
      }
    })
}
