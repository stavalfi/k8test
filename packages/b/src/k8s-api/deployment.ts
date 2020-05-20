import * as k8s from '@kubernetes/client-node'
import { Labels } from './types'
import { waitUntilDeploymentReady, waitUntilDeploymentDeleted } from './watch-resources'

export async function createDeployment(options: {
  appId: string
  appsApiClient: k8s.AppsV1Api
  watchClient: k8s.Watch
  namespaceName: string
  imageName: string
  containerPortToExpose: number
  containerLabels?: Labels
}) {
  const deploymentName = `${options.appId}-${options.imageName}-deployment`
  const response = await options.appsApiClient.createNamespacedDeployment(options.namespaceName, {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: deploymentName,
      labels: {
        [`${options.appId}-${options.imageName}-depmloyment`]: '',
      },
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: options.containerLabels,
      },
      template: {
        metadata: {
          name: `${options.appId}-${options.imageName}-pod`,
          labels: options.containerLabels,
        },
        spec: {
          containers: [
            {
              name: `${options.appId}-${options.imageName}-container`,
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

  await waitUntilDeploymentReady(deploymentName, {
    watchClient: options.watchClient,
  })

  return response
}

export async function deleteDeployment(options: {
  appsApiClient: k8s.AppsV1Api
  watchClient: k8s.Watch
  namespaceName: string
  deploymentName: string
}) {
  const response = await options.appsApiClient.deleteNamespacedDeployment(options.deploymentName, options.namespaceName)
  await waitUntilDeploymentDeleted(options.deploymentName, { watchClient: options.watchClient })
  return response
}
