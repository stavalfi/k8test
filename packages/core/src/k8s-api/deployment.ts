import * as k8s from '@kubernetes/client-node'
import { SingletoneStrategy } from '../types'
import { ExposeStrategy, Labels } from './types'
import { createResource, generateResourceName } from './utils'
import { waitUntilDeploymentDeleted, waitUntilDeploymentReady } from './watch-resources'

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
}): Promise<k8s.V1Deployment> {
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
          labels: resourceLabels,
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

async function findDeployment(
  deploymentNAme: string,
  options: {
    appsApiClient: k8s.AppsV1Api
    namespaceName: string
  },
): Promise<k8s.V1Deployment> {
  const deployment = await options.appsApiClient.readNamespacedDeployment(deploymentNAme, options.namespaceName)
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
