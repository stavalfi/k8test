import * as k8s from '@kubernetes/client-node'
import k8testLog from 'k8test-log'
import process from 'process'
import { ContainerOptions, ExposeStrategy, K8sClient, Labels, SingletonStrategy, SubscriptionOperation } from './types'
import { createResource, generateResourceName, getSubscriptionLabel, isSubscriptionLabel } from './utils'
import { waitUntilDeploymentDeleted, waitUntilDeploymentReady } from './watch-resources'

const log = k8testLog('k8s-api:deployment')

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
  imagePort: number
  podLabels: Labels
  exposeStrategy: ExposeStrategy
  singletonStrategy: SingletonStrategy
  containerOptions?: ContainerOptions
  deploymentName: string
  deploymentLabels: Labels
}): Promise<{ resource: k8s.V1Deployment; isNewResource: boolean }> {
  log('creating deployment to resource "%s"', options.deploymentName)
  const deploymentResult = await createResource<k8s.V1Deployment>({
    appId: options.appId,
    imageName: options.imageName,
    namespaceName: options.namespaceName,
    singletonStrategy: options.singletonStrategy,
    resourceName: options.deploymentName,
    resourcesLabels: options.deploymentLabels,
    createResource: () => ({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: options.deploymentName,
        labels: { ...options.deploymentLabels, ...getSubscriptionLabel(SubscriptionOperation.subscribe) },
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
                name: options.deploymentName,
                image: options.imageName,
                ports: [
                  {
                    containerPort: options.imagePort,
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
    deleteResource: () =>
      deleteDeployment({
        k8sClient: options.k8sClient,
        namespaceName: options.namespaceName,
        deploymentName: options.deploymentName,
      }),
    waitUntilReady: () =>
      waitUntilDeploymentReady(options.deploymentName, {
        k8sClient: options.k8sClient,
        namespaceName: options.namespaceName,
      }),
  })

  log(
    `%s deployment to resource "%s"`,
    deploymentResult.isNewResource ? 'created' : 'using existing',
    options.deploymentName,
  )

  return deploymentResult
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
