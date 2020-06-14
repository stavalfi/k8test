import * as k8s from '@kubernetes/client-node'
import k8testLog from 'k8test-log'
import { k8testNamespaceName } from './namespace'
import { K8sClient, SingletonStrategy } from './types'
import { createResource } from './utils'
import { waitUntilClusterRoleBindingCreated, waitUntilClusterRoleCreated } from './watch-resources'

const log = k8testLog('k8s-api:role')

export async function grantAdminRoleToCluster(k8sClient: K8sClient) {
  log('creating (if not exist) admin role with binding')
  const clusterRole = await createResource<k8s.V1ClusterRole>({
    namespaceName: k8testNamespaceName(),
    singletonStrategy: SingletonStrategy.oneInNamespace,
    createResource: (resourceName, resourceLabels) => ({
      kind: 'ClusterRole',
      apiVersion: 'rbac.authorization.k8s.io/v1',
      metadata: {
        name: resourceName,
        namespace: k8testNamespaceName(),
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
    failFastIfExist: true,
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
    namespaceName: k8testNamespaceName(),
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
          namespace: k8testNamespaceName(),
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
    failFastIfExist: true,
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
