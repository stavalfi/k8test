import * as k8s from '@kubernetes/client-node'
import k8testLog from 'k8test-log'
import { K8sClient, SingletonStrategy } from './types'
import { createResource } from './utils'
import {
  waitUntilClusterRoleBindingCreated,
  waitUntilClusterRoleBindingDeleted,
  waitUntilClusterRoleCreated,
  waitUntilClusterRoleDeleted,
} from './watch-resources'

const log = k8testLog('k8s-api:role')

export async function deleteRolesIf(options: {
  k8sClient: K8sClient
  predicate: (resource: k8s.V1ClusterRole | k8s.V1ClusterRoleBinding) => boolean
}): Promise<void> {
  const clusterRolesBindings = await options.k8sClient.authClient
    .listClusterRole()
    .then(clusterRolesBindingsRespond => clusterRolesBindingsRespond.body.items.filter(options.predicate))

  await Promise.all(
    clusterRolesBindings.map(clusterRoleBinding =>
      Promise.all([
        waitUntilClusterRoleBindingDeleted(clusterRoleBinding.metadata?.name!, {
          k8sClient: options.k8sClient,
        }),
        options.k8sClient.authClient.deleteClusterRoleBinding(clusterRoleBinding.metadata?.name!),
      ]),
    ),
  )

  const clusterRoles = await options.k8sClient.authClient
    .listClusterRole()
    .then(clusterRolesRespond => clusterRolesRespond.body.items.filter(options.predicate))

  await Promise.all(
    clusterRoles.map(clusterRole =>
      Promise.all([
        waitUntilClusterRoleDeleted(clusterRole.metadata?.name!, {
          k8sClient: options.k8sClient,
        }),
        options.k8sClient.authClient.deleteClusterRole(clusterRole.metadata?.name!),
      ]),
    ),
  )
}

export async function grantAdminRoleToCluster(k8sClient: K8sClient, namespaceName: string) {
  log('creating (if not exist) admin role with binding')
  const clusterRole = await createResource<k8s.V1ClusterRole>({
    namespaceName,
    singletonStrategy: SingletonStrategy.oneInNamespace,
    createResource: (resourceName, resourceLabels) => ({
      kind: 'ClusterRole',
      apiVersion: 'rbac.authorization.k8s.io/v1',
      metadata: {
        name: resourceName,
        namespace: namespaceName,
        labels: resourceLabels,
      },
      rules: [
        {
          apiGroups: ['*'],
          resources: ['*'],
          verbs: ['*'],
        },
      ],
    }),
    createInK8s: resource => k8sClient.authClient.createClusterRole(resource),
    deleteResource: roleName => k8sClient.authClient.deleteClusterRole(roleName),
    waitUntilReady: resourceName =>
      waitUntilClusterRoleCreated(resourceName, {
        k8sClient,
      }),
  })

  const roleName = clusterRole.resource.metadata?.name

  if (!roleName) {
    throw new Error(`role was created without a name. bug. role: ${JSON.stringify(clusterRole, null, 2)}`)
  }

  if (clusterRole.isNewResource) {
    // multiple process will run this function so I want to log only when the resource created
    log('created admin role')
  }

  const clusterRoleBinding = await createResource<k8s.V1ClusterRoleBinding>({
    namespaceName,
    singletonStrategy: SingletonStrategy.oneInNamespace,
    createResource: (resourceName, resourceLabels) => ({
      kind: 'ClusterRoleBinding',
      apiVersion: 'rbac.authorization.k8s.io/v1',
      metadata: {
        name: resourceName,
        labels: resourceLabels,
      },
      subjects: [
        {
          kind: 'ServiceAccount',
          name: 'default',
          namespace: namespaceName,
        },
      ],
      roleRef: {
        kind: 'ClusterRole',
        name: roleName,
        apiGroup: 'rbac.authorization.k8s.io',
      },
    }),
    createInK8s: resource => k8sClient.authClient.createClusterRoleBinding(resource),
    deleteResource: roleName => k8sClient.authClient.deleteClusterRoleBinding(roleName),
    waitUntilReady: resourceName =>
      waitUntilClusterRoleBindingCreated(resourceName, {
        k8sClient,
      }),
  })

  if (clusterRoleBinding.isNewResource) {
    // multiple process will run this function so I want to log only when the resource created
    log('bind role "%s"', roleName)
  }
}
