/* eslint-disable no-console */
import * as k8s from '@kubernetes/client-node'
import { SingletonStrategy } from './types'
import { ExposeStrategy, K8sClient } from './types'
import { createResource } from './utils'
import { waitUntilServiceCreated, waitUntilServiceDeleted } from './watch-resources'

export async function createService(options: {
  appId: string
  k8sClient: K8sClient
  namespaceName: string
  imageName: string
  podPortToExpose: number
  singletonStrategy: SingletonStrategy
}): Promise<{ resource: k8s.V1Service; isNewResource: boolean }> {
  return createResource({
    appId: options.appId,
    imageName: options.imageName,
    namespaceName: options.namespaceName,
    singletonStrategy: options.singletonStrategy,
    create: (resourceName, resourceLabels) =>
      options.k8sClient.apiClient.createNamespacedService(options.namespaceName, {
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
        k8sClient: options.k8sClient,
        namespaceName: options.namespaceName,
      }),
    waitUntilCreated: resourceName =>
      waitUntilServiceCreated(resourceName, {
        k8sClient: options.k8sClient,
        namespaceName: options.namespaceName,
      }),
  })
}

async function findService(
  serviceName: string,
  options: {
    k8sClient: K8sClient
    namespaceName: string
  },
): Promise<k8s.V1Service> {
  const service = await options.k8sClient.apiClient.readNamespacedService(serviceName, options.namespaceName)
  return service.body
}

export async function deleteService(options: { k8sClient: K8sClient; namespaceName: string; serviceName: string }) {
  const [, response] = await Promise.all([
    waitUntilServiceDeleted(options.serviceName, {
      k8sClient: options.k8sClient,
      namespaceName: options.namespaceName,
    }),
    options.k8sClient.apiClient.deleteNamespacedService(options.serviceName, options.namespaceName),
  ])
  return response
}

// get the port on the user machine that is pointing to the container port
export type GetDeployedImagePort = (
  serviceName: string,
  options: {
    k8sClient: K8sClient
    namespaceName: string
    exposeStrategy: ExposeStrategy
  },
) => Promise<number>

export const getDeployedImagePort: GetDeployedImagePort = async (serviceName, options) => {
  const response = await options.k8sClient.apiClient.listNamespacedService(options.namespaceName)
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
