import * as k8s from '@kubernetes/client-node'
import { SingletoneStrategy } from '../types'
import { ExposeStrategy, Labels, SubscriptionOperation } from './types'
import { createResource, generateResourceName } from './utils'
import { waitUntilDeploymentDeleted, waitUntilDeploymentReady } from './watch-resources'
import chance from 'chance'

export async function createDeployment(options: {
  appId: string
  appsApiClient: k8s.AppsV1Api
  watchClient: k8s.Watch
  namespaceName: string
  imageName: string
  containerPortToExpose: number
  containerLabels: Labels
  exposeStrategy: ExposeStrategy
  singletoneStrategy: SingletoneStrategy
}): Promise<{ resource: k8s.V1Deployment; isNewResource: boolean }> {
  return createResource({
    appId: options.appId,
    imageName: options.imageName,
    namespaceName: options.namespaceName,
    singletoneStrategy: options.singletoneStrategy,
    create: (resourceName, resourceLabels) =>
      options.appsApiClient.createNamespacedDeployment(options.namespaceName, {
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
                singletoneStrategy: options.singletoneStrategy,
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
                    singletoneStrategy: options.singletoneStrategy,
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
        appsApiClient: options.appsApiClient,
        namespaceName: options.namespaceName,
      }),
    waitUntilCreated: resourceName =>
      waitUntilDeploymentReady(resourceName, {
        watchClient: options.watchClient,
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
    appsApiClient: k8s.AppsV1Api
    namespaceName: string
    operation: SubscriptionOperation
  },
): Promise<UpdatedBalance> {
  // workaround: https://github.com/kubernetes-client/javascript/issues/19#issuecomment-582886605
  const headers = { 'content-type': 'application/strategic-merge-patch+json' }
  const { body } = await options.appsApiClient.patchNamespacedDeployment(
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
    appsApiClient: k8s.AppsV1Api
    namespaceName: string
  },
): Promise<k8s.V1Deployment> {
  const deployment = await options.appsApiClient.readNamespacedDeployment(deploymentName, options.namespaceName)
  return deployment.body
}

export async function deleteDeployment(options: {
  appsApiClient: k8s.AppsV1Api
  watchClient: k8s.Watch
  namespaceName: string
  deploymentName: string
}) {
  const [, response] = await Promise.all([
    waitUntilDeploymentDeleted(options.deploymentName, {
      watchClient: options.watchClient,
      namespaceName: options.namespaceName,
    }),
    options.appsApiClient.deleteNamespacedDeployment(options.deploymentName, options.namespaceName),
  ])
  return response
}
