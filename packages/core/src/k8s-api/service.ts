/* eslint-disable no-console */
import * as k8s from '@kubernetes/client-node'
import { SingletoneStrategy } from '../types'
import { ExposeStrategy } from './types'
import { createResource } from './utils'
import { waitUntilServiceCreated, waitUntilServiceDeleted } from './watch-resources'

export async function createService(options: {
  appId: string
  apiClient: k8s.CoreV1Api
  watchClient: k8s.Watch
  namespaceName: string
  imageName: string
  podPortToExpose: number
  singletoneStrategy: SingletoneStrategy
}): Promise<{ resource: k8s.V1Service; isNewResource: boolean }> {
  return createResource({
    appId: options.appId,
    imageName: options.imageName,
    namespaceName: options.namespaceName,
    singletoneStrategy: options.singletoneStrategy,
    create: (resourceName, resourceLabels) =>
      options.apiClient.createNamespacedService(options.namespaceName, {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: resourceName,
          labels: resourceLabels,
        },
        spec: {
          type: 'NodePort',
          selector: resourceLabels,
          ports: [
            {
              port: options.podPortToExpose,
            },
          ],
        },
      }),
    find: resourceName =>
      findService(resourceName, {
        apiClient: options.apiClient,
        namespaceName: options.namespaceName,
      }),
    waitUntilCreated: resourceName =>
      waitUntilServiceCreated(resourceName, {
        watchClient: options.watchClient,
        namespaceName: options.namespaceName,
      }),
  })
}

async function findService(
  serviceName: string,
  options: {
    apiClient: k8s.CoreV1Api
    namespaceName: string
  },
): Promise<k8s.V1Service> {
  const service = await options.apiClient.readNamespacedService(serviceName, options.namespaceName)
  return service.body
}

export async function deleteService(options: {
  apiClient: k8s.CoreV1Api
  watchClient: k8s.Watch
  namespaceName: string
  serviceName: string
}) {
  const [, response] = await Promise.all([
    waitUntilServiceDeleted(options.serviceName, {
      watchClient: options.watchClient,
      namespaceName: options.namespaceName,
    }),
    options.apiClient.deleteNamespacedService(options.serviceName, options.namespaceName),
  ])
  return response
}

// get the port on the user machine that is pointing to the container port
export type GetDeployedImagePort = (
  serviceName: string,
  options: {
    apiClient: k8s.CoreV1Api
    namespaceName: string
    exposeStrategy: ExposeStrategy
  },
) => Promise<number>

export const getDeployedImagePort: GetDeployedImagePort = async (serviceName, options) => {
  const response = await options.apiClient.listNamespacedService(options.namespaceName)
  const service = response.body.items.find(service => service.metadata?.name === serviceName)
  if (!service) {
    throw new Error(
      `could not find a specific service to extract the node-port from him. the response contains the following services: ${JSON.stringify(
        response.body.items,
        null,
        2,
      )}`,
    )
  }
  const ports = service.spec?.ports
  if (!ports || ports.length !== 1) {
    throw new Error(
      `could not find a the node port in the service. I expect a single port instance. it maybe because the service was created without specifying the port to expose from the pods it is matching to in the deployment. ports: ${JSON.stringify(
        ports,
        null,
        2,
      )}`,
    )
  }
  switch (options.exposeStrategy) {
    case ExposeStrategy.userMachine: {
      const nodePort = ports[0].nodePort
      if (!nodePort) {
        throw new Error(
          `could not find a the node port in the service. port instance: ${JSON.stringify(ports[0], null, 2)}`,
        )
      }
      return nodePort
    }
    case ExposeStrategy.insideCluster: {
      throw new Error(`enum not supported: ${options.exposeStrategy}`)
    }
    default:
      throw new Error(`enum not supported: ${options.exposeStrategy}`)
  }
}