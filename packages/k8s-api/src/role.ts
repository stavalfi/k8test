import * as k8s from '@kubernetes/client-node'
import { K8sClient, SingletonStrategy } from './types'
import { createResource } from './utils'
import { internalK8testResourcesAppId } from 'k8s-api'
import { k8testNamespaceName } from './namespace'
import { waitUntilRoleCreated, waitUntilRoleBindingCreated } from './watch-resources'
import k8testLog from 'k8test-log'

const log = k8testLog('k8s-api:role')

export async function grantAdminRoleToNamespace(options: { k8sClient: K8sClient; namespaceName: string }) {
  log('creating (if not exist) admin role with binding to namespace "%s"', options.namespaceName)
  const role = await createResource<k8s.V1Role>({
    appId: internalK8testResourcesAppId(),
    namespaceName: k8testNamespaceName(),
    singletonStrategy: SingletonStrategy.oneInNamespace,
    createResource: (resourceName, resourceLabels) => ({
      kind: 'Role',
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
    createInK8s: resource => options.k8sClient.authClient.createNamespacedRole('k8test', resource),
    deleteResource: roleName => options.k8sClient.authClient.deleteNamespacedRole(roleName, options.namespaceName),
    failFastIfExist: true,
    waitUntilReady: resourceName =>
      waitUntilRoleCreated(resourceName, {
        k8sClient: options.k8sClient,
        namespaceName: options.namespaceName,
      }),
  })

  const roleName = role.resource.metadata?.name

  if (!roleName) {
    throw new Error(`role was created without a name. bug. role: ${JSON.stringify(role, null, 2)}`)
  }

  if (role.isNewResource) {
    // multiple process will run this function so I want to log only when the resource created
    log('created admin role to namespace "%s"', options.namespaceName)
  }

  const roleBinding = await createResource<k8s.V1RoleBinding>({
    appId: internalK8testResourcesAppId(),
    namespaceName: k8testNamespaceName(),
    singletonStrategy: SingletonStrategy.oneInNamespace,
    createResource: (resourceName, resourceLabels) => ({
      kind: 'RoleBinding',
      apiVersion: 'rbac.authorization.k8s.io/v1',
      metadata: {
        name: resourceName,
        namespace: k8testNamespaceName(),
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
        kind: 'Role',
        name: roleName,
        apiGroup: 'rbac.authorization.k8s.io',
      },
    }),
    createInK8s: resource => options.k8sClient.authClient.createNamespacedRoleBinding('k8test', resource),
    deleteResource: roleName =>
      options.k8sClient.authClient.deleteNamespacedRoleBinding(roleName, options.namespaceName),
    failFastIfExist: true,
    waitUntilReady: resourceName =>
      waitUntilRoleBindingCreated(resourceName, {
        k8sClient: options.k8sClient,
        namespaceName: options.namespaceName,
      }),
  })

  if (roleBinding.isNewResource) {
    // multiple process will run this function so I want to log only when the resource created
    log('bind role "%s" to namespace "%s"', roleName, options.namespaceName)
  }
}
