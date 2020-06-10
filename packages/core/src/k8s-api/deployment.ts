import * as k8s from '@kubernetes/client-node'
import { SingletonStrategy } from '../types'
import { ExposeStrategy, Labels, SubscriptionOperation, K8sClient } from './types'
import { createResource, generateResourceName } from './utils'
import { waitUntilDeploymentDeleted, waitUntilDeploymentReady } from './watch-resources'
import chance from 'chance'

export async function createDeployment(options: {
  appId: string
  k8sClient: K8sClient
  namespaceName: string
  imageName: string
  containerPortToExpose: number
  containerLabels: Labels
  exposeStrategy: ExposeStrategy
  singletonStrategy: SingletonStrategy
}): Promise<{ resource: k8s.V1Deployment; isNewResource: boolean }> {
  return createResource({
    appId: options.appId,
    imageName: options.imageName,
    namespaceName: options.namespaceName,
    singletonStrategy: options.singletonStrategy,
    create: (resourceName, resourceLabels) =>
      options.k8sClient.appsApiClient.createNamespacedDeployment(options.namespaceName, {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: resourceName,
          labels: { ...resourceLabels, ...getSubscriptionLabel(SubscriptionOperation.subscribe) },
        },
        spec: {
          replicas: 1,
          selector: {
            matchLabels: options.containerLabels,
          },
          template: {
            metadata: {
              name: generateResourceName({
                appId: options.appId,
                imageName: options.imageName,
                namespaceName: options.namespaceName,
                singletonStrategy: options.singletonStrategy,
              }).resourceName,
              labels: options.containerLabels,
            },
            spec: {
              containers: [
                {
                  name: generateResourceName({
                    appId: options.appId,
                    imageName: options.imageName,
                    namespaceName: options.namespaceName,
                    singletonStrategy: options.singletonStrategy,
                  }).resourceName,
                  image: options.imageName,
                  ports: [
                    {
                      containerPort: options.containerPortToExpose,
                    },
                  ],
                },
              ],
            },
          },
        },
      }),
    find: resourceName =>
      findDeployment(resourceName, {
        k8sClient: options.k8sClient,
        namespaceName: options.namespaceName,
      }),
    waitUntilCreated: resourceName =>
      waitUntilDeploymentReady(resourceName, {
        k8sClient: options.k8sClient,
        namespaceName: options.namespaceName,
      }),
  })
}

function getSubscriptionLabel(operation: SubscriptionOperation) {
  return {
    [`subscription-${chance()
      .hash()
      .slice(0, 10)}`]: operation,
  }
}

function isSubscriptionLabel(key: string, value: string): boolean {
  return (
    key.startsWith('subscription-') &&
    (value === SubscriptionOperation.subscribe || value === SubscriptionOperation.unsubscribe)
  )
}

type UpdatedBalance = number
export async function addSubscriptionsLabel(
  deploymentName: string,
  options: {
    k8sClient: K8sClient
    namespaceName: string
    operation: SubscriptionOperation
  },
): Promise<UpdatedBalance> {
  // workaround: https://github.com/kubernetes-client/javascript/issues/19#issuecomment-582886605
  const headers = { 'content-type': 'application/strategic-merge-patch+json' }
  const { body } = await options.k8sClient.appsApiClient.patchNamespacedDeployment(
    deploymentName,
    options.namespaceName,
    {
      metadata: {
        labels: {
          ...getSubscriptionLabel(options.operation),
        },
      },
    },
    undefined,
    undefined,
    undefined,
    undefined,
    { headers },
  )

  return Object.entries(body.metadata?.labels || {})
    .filter(([key, value]) => isSubscriptionLabel(key, value))
    .map(([, value]) => value)
    .map(value => (value === SubscriptionOperation.subscribe ? 1 : -1))
    .reduce((acc, value) => acc + value, 0)
}

async function findDeployment(
  deploymentName: string,
  options: {
    k8sClient: K8sClient
    namespaceName: string
  },
): Promise<k8s.V1Deployment> {
  const deployment = await options.k8sClient.appsApiClient.readNamespacedDeployment(
    deploymentName,
    options.namespaceName,
  )
  return deployment.body
}

export async function deleteDeployment(options: {
  k8sClient: K8sClient
  namespaceName: string
  deploymentName: string
}) {
  const [, response] = await Promise.all([
    waitUntilDeploymentDeleted(options.deploymentName, {
      k8sClient: options.k8sClient,
      namespaceName: options.namespaceName,
    }),
    options.k8sClient.appsApiClient.deleteNamespacedDeployment(options.deploymentName, options.namespaceName),
  ])
  return response
}
