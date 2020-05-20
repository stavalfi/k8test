import * as k8s from '@kubernetes/client-node'
import { Labels } from './types'
import { waitUntilDeploymentReady, waitUntilDeploymentDeleted } from './watch-resources'
import { generateString } from './utils'

export async function createDeployment(options: {
  appId: string
  appsApiClient: k8s.AppsV1Api
  watchClient: k8s.Watch
  namespaceName: string
  imageName: string
  containerPortToExpose: number
  containerLabels: Labels
}) {
  const deploymentName = generateString(options.appId, options.imageName, { postfix: 'depmloyment' })
  const [, response] = await Promise.all([
    waitUntilDeploymentReady(deploymentName, {
      watchClient: options.watchClient,
      namespaceName: options.namespaceName,
    }),
    options.appsApiClient.createNamespacedDeployment(options.namespaceName, {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: deploymentName,
        labels: {
          [deploymentName]: 'value3',
        },
      },
      spec: {
        replicas: 1,
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
    }),
  ])
  return response
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
