import * as k8s from '@kubernetes/client-node'

enum ResourceEventType {
  resourceAdded = 'ADDED',
  resourceModified = 'MODIFIED',
  resourceDeleted = 'DELETED',
}

export const waitUntilNamespaceCreated = (namespaceName: string, options: { watchClient: k8s.Watch }) =>
  waitForResource<k8s.V1Namespace>({
    watchClient: options.watchClient,
    api: `/api/v1/namespaces`,
    resouceName: namespaceName,
    predicate: resourceEventType => resourceEventType === ResourceEventType.resourceAdded,
  })

export const waitUntilNamespaceDeleted = (namespaceName: string, options: { watchClient: k8s.Watch }) =>
  waitForResource<k8s.V1Namespace>({
    watchClient: options.watchClient,
    api: `/api/v1/namespaces`,
    resouceName: namespaceName,
    predicate: resourceEventType => resourceEventType === ResourceEventType.resourceDeleted,
  })

export const waitUntilDeploymentReady = (
  deploymentName: string,
  options: { watchClient: k8s.Watch; namespaceName: string },
) =>
  waitForResource<k8s.V1Deployment>({
    watchClient: options.watchClient,
    api: `/apis/apps/v1/namespaces/${options.namespaceName}/deployments`,
    resouceName: deploymentName,
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
  options: { watchClient: k8s.Watch; namespaceName: string },
) =>
  waitForResource<k8s.V1Deployment>({
    watchClient: options.watchClient,
    debug: true,
    api: `/apis/apps/v1/namespaces/${options.namespaceName}/deployments`,
    resouceName: deploymentName,
    namespaceName: options.namespaceName,
    predicate: resourceEventType => resourceEventType === ResourceEventType.resourceDeleted,
  })

export const waitUntilServiceCreated = (
  serviceName: string,
  options: { watchClient: k8s.Watch; namespaceName: string },
) =>
  waitForResource<k8s.V1Service>({
    watchClient: options.watchClient,
    api: `/api/v1/namespaces/${options.namespaceName}/services`,
    resouceName: serviceName,
    namespaceName: options.namespaceName,
    predicate: resourceEventType => resourceEventType === ResourceEventType.resourceAdded,
  })

export const waitUntilServiceDeleted = (
  serviceName: string,
  options: { watchClient: k8s.Watch; namespaceName: string },
) =>
  waitForResource<k8s.V1Service>({
    watchClient: options.watchClient,
    api: `/api/v1/namespaces/${options.namespaceName}/services`,
    resouceName: serviceName,
    namespaceName: options.namespaceName,
    debug: true,
    predicate: resourceEventType => resourceEventType === ResourceEventType.resourceDeleted,
  })

async function waitForResource<Resource extends { metadata?: { name?: string; namespace?: string } }>(options: {
  watchClient: k8s.Watch
  api: string
  resouceName: string
  namespaceName?: string
  debug?: boolean
  predicate: (resourceEventType: ResourceEventType, resource: Resource) => boolean
}): Promise<void> {
  await new Promise((res, rej) => {
    options.watchClient.watch(
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
          resource.metadata?.name === options.resouceName
        ) {
          if (options.predicate(type as ResourceEventType, resource)) {
            return res(resource)
          }
        }
      },
      err => {
        return err ? rej(err) : rej('resource not found')
      },
    )
  })
}
