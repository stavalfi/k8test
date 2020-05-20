import * as k8s from '@kubernetes/client-node'
import { Labels } from './types'

export async function createDeployment(options: {
  appId: string
  k8sAppsApiClient: k8s.AppsV1Api
  namespaceName: string
  imageName: string
  containerPortToExpose: number
  containerLabels?: Labels
}) {
  return options.k8sAppsApiClient.createNamespacedDeployment(options.namespaceName, {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: `${options.appId}-${options.imageName}-deployment`,
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
}
