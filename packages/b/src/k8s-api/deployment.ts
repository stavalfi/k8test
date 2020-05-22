import * as k8s from '@kubernetes/client-node'
import { Labels, ExposeStrategy } from './types'
import { generateString, ignoreAlreadyExistError } from './utils'
import { waitUntilDeploymentDeleted, waitUntilDeploymentReady } from './watch-resources'

export async function isDeploymentExist(
  deploymentName: string,
  options: {
    appsApiClient: k8s.AppsV1Api
    namespaceName: string
  },
) {
  const deployments = await options.appsApiClient.listNamespacedDeployment(options.namespaceName)
  return deployments.body.items.some(deployment => deployment.metadata?.name === deploymentName)
}

export const generateDeploymentName = (appId: string, imageName: string) =>
  generateString(appId, imageName, { postfix: 'depmloyment' })

export async function createDeployment(options: {
  appId: string
  appsApiClient: k8s.AppsV1Api
  watchClient: k8s.Watch
  namespaceName: string
  imageName: string
  containerPortToExpose: number
  containerLabels: Labels
  exposeStrategy: ExposeStrategy
  dontFailIfExist: boolean
}): Promise<k8s.V1Deployment> {
  const deploymentName = generateDeploymentName(options.appId, options.imageName)
  await options.appsApiClient
    .createNamespacedDeployment(options.namespaceName, {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: deploymentName,
        labels: {
          [deploymentName]: 'value3',
        },
      },
      spec: {
        replicas: 2,
        selector: {
          matchLabels: options.containerLabels,
        },
        template: {
          metadata: {
            name: generateString(options.appId, options.imageName, { postfix: 'container' }),
            labels: options.containerLabels,
          },
          spec: {
            containers: [
              {
                name: generateString(options.appId, options.imageName, { postfix: 'container' }),
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
    })
    .catch(ignoreAlreadyExistError(options.dontFailIfExist))

  return waitUntilDeploymentReady(deploymentName, {
    watchClient: options.watchClient,
    namespaceName: options.namespaceName,
  })
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
