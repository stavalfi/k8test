/* eslint-disable no-console */
import * as k8s from '@kubernetes/client-node'
import { SingletonStrategy } from './types'
import { ExposeStrategy, K8sClient } from './types'
import { createResource } from './utils'
import { waitUntilServiceCreated, waitUntilServiceDeleted } from './watch-resources'
import { Address4 } from 'ip-address'
import k8testLog from 'k8test-log'

const log = k8testLog('k8s-api:service')

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
              // docs: https://www.bmc.com/blogs/kubernetes-port-targetport-nodeport/
              port: options.podPortToExpose, // other pods on the cluster can access to this service using this port and this service will direct the request to the relevant pods
              targetPort: Object(options.podPortToExpose), // this service will forward requests to pods in this port. those ports are expected to expose this port
            },
          ],
        },
      }),
    waitUntilReady: resourceName =>
      waitUntilServiceCreated(resourceName, {
        k8sClient: options.k8sClient,
        namespaceName: options.namespaceName,
      }),
  })
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

export async function deleteAllTempServices(options: { k8sClient: K8sClient; namespaceName: string }) {
  log('deleting all temp-services in namespace: "%s"', options.namespaceName)

  const services = await options.k8sClient.apiClient.listNamespacedService(options.namespaceName)
  await Promise.all(
    services.body.items
      .filter(service => {
        const singletonStrategy = service.metadata?.labels?.['singleton-strategy']
        switch (singletonStrategy) {
          case SingletonStrategy.oneInCluster:
            return false
          case SingletonStrategy.manyInAppId:
          case SingletonStrategy.oneInAppId:
            return true
          default:
            return true
        }
      })
      .map(service => service.metadata?.name || '')
      .map(serviceName =>
        deleteService({ k8sClient: options.k8sClient, namespaceName: options.namespaceName, serviceName }),
      ),
  )

  log('deleted all temp-services in namespace: "%s"', options.namespaceName)
}

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
      const port = ports[0].port
      if (!port) {
        throw new Error(`could not find a the port in the service. port instance: ${JSON.stringify(ports[0], null, 2)}`)
      }
      return port
    }
    default:
      throw new Error(`enum not supported: ${options.exposeStrategy}`)
  }
}

export type GetServiceAddress = (
  serviceName: string,
  options: {
    k8sClient: K8sClient
    namespaceName: string
  },
) => Promise<string>

export const getServiceIp: GetServiceAddress = async (serviceName, options) => {
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
  const serviceIp = service.spec?.clusterIP
  if (!serviceIp) {
    throw new Error(`could not find a the service ip. service: ${JSON.stringify(service, null, 2)}`)
  }
  if (!new Address4(serviceIp).isValid()) {
    throw new Error(
      `service does not have ip that is exposed inside the cluster. service-ip: ${JSON.stringify(serviceIp, null, 2)}`,
    )
  }
  return serviceIp
}
