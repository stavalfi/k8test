/* eslint-disable no-console */
import * as k8s from '@kubernetes/client-node'
import { waitUntilServiceCreated, waitUntilServiceDeleted } from './watch-resources'
import { generateString } from './utils'

export async function createService(options: {
  appId: string
  apiClient: k8s.CoreV1Api
  watchClient: k8s.Watch
  namespaceName: string
  imageName: string
  podPortToExpose: number
}) {
  const serviceName = generateString(options.appId, options.imageName, { postfix: 'service' })
  const [, response] = await Promise.all([
    waitUntilServiceCreated(serviceName, { watchClient: options.watchClient, namespaceName: options.namespaceName }),
    options.apiClient.createNamespacedService(options.namespaceName, {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: serviceName,
        labels: {
          [serviceName]: 'value1',
        },
      },
      spec: {
        type: 'NodePort',
        selector: {
          [generateString(options.appId, options.imageName, { postfix: 'container' })]: 'value2',
        },
        ports: [
          {
            port: options.podPortToExpose,
          },
        ],
      },
    }),
  ])
  return response
}

export async function deleteService(options: {
  apiClient: k8s.CoreV1Api
  watchClient: k8s.Watch
  namespaceName: string
  serviceName: string
}) {
  const [, response] = await Promise.all([
    await waitUntilServiceDeleted(options.serviceName, {
      watchClient: options.watchClient,
      namespaceName: options.namespaceName,
    }),
    options.apiClient.deleteNamespacedService(options.serviceName, options.namespaceName),
  ])
  return response
}

// get the port on the user machine that is pointing to the container port
export type GetDeployedImagePort = (options: {
  apiClient: k8s.CoreV1Api
  namespaceName: string
  serviceLabelKey: string
}) => Promise<number>

export const getDeployedImagePort: GetDeployedImagePort = async options => {
  const response = await options.apiClient.listNamespacedService(
    options.namespaceName,
    undefined,
    false,
    undefined,
    undefined,
    options.serviceLabelKey,
  )
  const items = response.body.items
  if (items.length !== 1) {
    throw new Error(
      `could not find a specific service to extract the node-port from him. the response contains the following services: ${JSON.stringify(
        items,
        null,
        2,
      )}`,
    )
  }
  const ports = items[0].spec?.ports
  if (!ports || ports.length !== 1) {
    throw new Error(
      `could not find a the node port in the service. I expect a single port instance. it maybe because the service was created without specifying the port to expose from the pods it is matching to in the deployment. ports: ${JSON.stringify(
        ports,
        null,
        2,
      )}`,
    )
  }
  const nodePort = ports[0].nodePort
  if (!nodePort) {
    throw new Error(
      `could not find a the node port in the service. port instance: ${JSON.stringify(ports[0], null, 2)}`,
    )
  }
  return nodePort
}
