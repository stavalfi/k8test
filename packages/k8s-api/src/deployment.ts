import * as k8s from '@kubernetes/client-node'
import chance from 'chance'
import k8testLog from 'k8test-log'
import { ContainerOptions, ExposeStrategy, K8sClient, Labels, SingletonStrategy, SubscriptionOperation } from './types'
import { createResource, generateResourceName } from './utils'
import { waitUntilDeploymentDeleted, waitUntilDeploymentReady } from './watch-resources'
import { findPodByLabels } from './pod'
import process from 'process'

const log = k8testLog('k8s-api:deployment')

export async function createDeployment(options: {
  appId: string
  k8sClient: K8sClient
  namespaceName: string
  imageName: string
  containerPortToExpose: number
  podLabels: Labels
  exposeStrategy: ExposeStrategy
  singletonStrategy: SingletonStrategy
  containerOptions?: ContainerOptions
  podStdio?: {
    stdout?: NodeJS.WriteStream
    stderr?: NodeJS.WriteStream
  }
  failFastIfExist?: boolean
}): Promise<{ resource: k8s.V1Deployment; isNewResource: boolean }> {
  const containerName = generateResourceName({
    appId: options.appId,
    imageName: options.imageName,
    namespaceName: options.namespaceName,
    singletonStrategy: options.singletonStrategy,
  })
  const deployment = await createResource<k8s.V1Deployment>({
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
    failFastIfExist: options.failFastIfExist,
    waitUntilReady: resourceName =>
      waitUntilDeploymentReady(resourceName, {
        k8sClient: options.k8sClient,
        namespaceName: options.namespaceName,
      }),
  })

  if (options.podStdio) {
    const pod = await findPodByLabels({
      k8sClient: options.k8sClient,
      namespaceName: options.namespaceName,
      podLabels: options.podLabels,
    })
    const podName = pod.metadata?.name
    if (!podName) {
      throw new Error(`pod created or found without a name specifier. its a bug`)
    }
    await options.k8sClient.attach.attach(
      options.namespaceName,
      podName,
      containerName,
      options.podStdio.stdout,
      options.podStdio.stderr,
      null,
      false,
    )
  }

  return deployment
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

export async function deleteAllTempDeployments(options: { k8sClient: K8sClient; namespaceName: string }) {
  log('deleting all temp-deployments in namespace: "%s"', options.namespaceName)

  const deployments = await options.k8sClient.appsApiClient.listNamespacedDeployment(options.namespaceName)
  await Promise.all(
    deployments.body.items
      .filter(deployment => {
        const singletonStrategy = deployment.metadata?.labels?.['singleton-strategy']
        switch (singletonStrategy) {
          case SingletonStrategy.oneInNamespace:
            return false
          case SingletonStrategy.manyInAppId:
          case SingletonStrategy.oneInAppId:
            return true
          default:
            return true
        }
      })
      .map(deployment => deployment.metadata?.name || '')
      .map(deploymentName =>
        deleteDeployment({ k8sClient: options.k8sClient, namespaceName: options.namespaceName, deploymentName }),
      ),
  )

  log('deleted all temp-deployments in namespace: "%s"', options.namespaceName)
}
