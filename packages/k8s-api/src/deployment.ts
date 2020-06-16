import * as k8s from '@kubernetes/client-node'
import chance from 'chance'
import k8testLog from 'k8test-log'
import process from 'process'
import { ContainerOptions, ExposeStrategy, K8sClient, Labels, SingletonStrategy, SubscriptionOperation } from './types'
import { createResource, generateResourceName } from './utils'
import { waitUntilDeploymentDeleted, waitUntilDeploymentReady } from './watch-resources'

const log = k8testLog('k8s-api:deployment')

function getSubscriptionLabel(operation: SubscriptionOperation) {
  return {
    [`subscription-${chance()
      .hash()
      .slice(0, 10)}`]: operation,
  }
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

export async function createDeployment(options: {
  appId?: string
  k8sClient: K8sClient
  namespaceName: string
  imageName: string
  containerPortToExpose: number
  podLabels: Labels
  exposeStrategy: ExposeStrategy
  singletonStrategy: SingletonStrategy
  containerOptions?: ContainerOptions
  failFastIfExist?: boolean
}): Promise<{ resource: k8s.V1Deployment; isNewResource: boolean }> {
  log('creating deployment to image "%s" in namespace: "%s"', options.imageName, options.namespaceName)
  const containerName = generateResourceName({
    appId: options.appId,
    imageName: options.imageName,
    namespaceName: options.namespaceName,
    singletonStrategy: options.singletonStrategy,
  })
  const deploymentResult = await createResource<k8s.V1Deployment>({
    appId: options.appId,
    imageName: options.imageName,
    namespaceName: options.namespaceName,
    singletonStrategy: options.singletonStrategy,
    createResource: (resourceName, resourceLabels) => ({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: resourceName,
        labels: { ...resourceLabels, ...getSubscriptionLabel(SubscriptionOperation.subscribe) },
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: options.podLabels,
        },
        template: {
          metadata: {
            // this is not the final pod-name. k8s add hash to the end of the name
            name: generateResourceName({
              appId: options.appId,
              imageName: options.imageName,
              namespaceName: options.namespaceName,
              singletonStrategy: options.singletonStrategy,
            }),
            labels: options.podLabels,
          },
          spec: {
            serviceAccount: '',
            containers: [
              {
                ...options.containerOptions,
                name: containerName,
                image: options.imageName,
                ports: [
                  {
                    containerPort: options.containerPortToExpose,
                  },
                ],
                env: [
                  // eslint-disable-next-line no-process-env
                  ...(process.env['DEBUG'] ? [{ name: 'DEBUG', value: process.env['DEBUG'] }] : []),
                  { name: 'K8S_NAMESPACE', value: options.namespaceName },
                ],
              },
            ],
          },
        },
      },
    }),
    createInK8s: resource =>
      options.k8sClient.appsApiClient.createNamespacedDeployment(options.namespaceName, resource),
    deleteResource: deploymentName =>
      deleteDeployment({ k8sClient: options.k8sClient, namespaceName: options.namespaceName, deploymentName }),
    waitUntilReady: resourceName =>
      waitUntilDeploymentReady(resourceName, {
        k8sClient: options.k8sClient,
        namespaceName: options.namespaceName,
      }),
  })

  log(
    `${deploymentResult.isNewResource ? 'created' : 'using existing'} deployment to image "%s" in namespace: "%s"`,
    options.imageName,
    options.namespaceName,
  )

  return deploymentResult
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

export async function deleteDeploymentIf(options: {
  k8sClient: K8sClient
  namespaceName: string
  predicate: (resource: k8s.V1Deployment) => boolean
}) {
  log('deleting all temp-deployments in namespace: "%s"', options.namespaceName)

  const deployments = await options.k8sClient.appsApiClient.listNamespacedDeployment(options.namespaceName)
  await Promise.all(
    deployments.body.items
      .filter(options.predicate)
      .map(deployment => deployment.metadata?.name || '')
      .map(deploymentName =>
        deleteDeployment({ k8sClient: options.k8sClient, namespaceName: options.namespaceName, deploymentName }),
      ),
  )

  log('deleted all temp-deployments in namespace: "%s"', options.namespaceName)
}
