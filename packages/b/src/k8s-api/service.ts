/* eslint-disable no-console */
import * as k8s from '@kubernetes/client-node'

export async function createService(options: {
  appId: string
  k8sApiClient: k8s.CoreV1Api
  namespaceName: string
  imageName: string
  podPortToExpose: number
}) {
  return options.k8sApiClient.createNamespacedService(options.namespaceName, {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: `${options.appId}-${options.imageName}-service`,
      labels: {
        [`${options.appId}-${options.imageName}-service`]: '',
      },
    },
    spec: {
      type: 'NodePort',
      selector: {
        [`${options.appId}-${options.imageName}-container`]: '',
      },
      ports: [
        {
          port: options.podPortToExpose,
        },
      ],
    },
  })
}

// get the port on the user machine that is pointing to the container port
export async function getUserPort(options: {
  k8sApiClient: k8s.CoreV1Api
  namespaceName: string
  serviceLabelKey: string
}): Promise<number> {
  const response = await options.k8sApiClient.listNamespacedService(
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
