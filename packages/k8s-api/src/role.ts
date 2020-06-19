import * as k8s from '@kubernetes/client-node'
import k8testLog from 'k8test-log'
import { K8sClient, SingletonStrategy, Labels } from './types'
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

export async function grantAdminRoleToCluster({
  k8sClient,
  namespaceName,
  roleName,
  roleLabels,
}: {
  k8sClient: K8sClient
  namespaceName: string
  roleName: string
  roleLabels: Labels
}) {
  log('creating (if not exist) admin role with binding')
  const clusterRole = await createResource<k8s.V1ClusterRole>({
    namespaceName,
    singletonStrategy: SingletonStrategy.oneInNamespace,
    resourceName: roleName,
    resourcesLabels: roleLabels,
    createResource: () => ({
      kind: 'ClusterRole',
      apiVersion: 'rbac.authorization.k8s.io/v1',
      metadata: {
        name: roleName,
        namespace: namespaceName,
        labels: roleLabels,
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
    deleteResource: () => k8sClient.authClient.deleteClusterRole(roleName),
    waitUntilReady: () =>
      waitUntilClusterRoleCreated(roleName, {
        k8sClient,
      }),
  })

  if (clusterRole.isNewResource) {
    // multiple process will run this function so I want to log only when the resource created
    log('created admin role')
  }

  const clusterRoleBinding = await createResource<k8s.V1ClusterRoleBinding>({
    namespaceName,
    singletonStrategy: SingletonStrategy.oneInNamespace,
    resourceName: roleName,
    resourcesLabels: roleLabels,
    createResource: () => ({
      kind: 'ClusterRoleBinding',
      apiVersion: 'rbac.authorization.k8s.io/v1',
      metadata: {
        name: roleName,
        labels: roleLabels,
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
    deleteResource: () => k8sClient.authClient.deleteClusterRoleBinding(roleName),
    waitUntilReady: () =>
      waitUntilClusterRoleBindingCreated(roleName, {
        k8sClient,
      }),
  })

  if (clusterRoleBinding.isNewResource) {
    // multiple process will run this function so I want to log only when the resource created
    log('bind role "%s"', roleName)
  }
}
