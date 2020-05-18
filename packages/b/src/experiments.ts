/* eslint-disable no-console */
import * as k8s from '@kubernetes/client-node'

const kc = new k8s.KubeConfig()
kc.loadFromDefault()

const k8sApi = kc.makeApiClient(k8s.CoreV1Api)
const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api)

var namespace = {
  metadata: {
    name: 'test',
  },
}

const sleep = () => new Promise(res => setTimeout(res, 2000))

async function createNamespace() {
  console.log('Creating new namespace')
  await k8sApi.createNamespace(namespace)
  console.log('Created namespace')
  await sleep()
}

async function createDeployment(namespace: string, deployment: string): Promise<void> {
  console.log('Creating new deployment')
  await k8sAppsApi.createNamespacedDeployment(namespace, {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: deployment,
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          'pod-key1': 'pod-value1',
        },
      },
      template: {
        metadata: {
          name: 'pod1',
          labels: {
            'pod-key1': 'pod-value1',
          },
        },
        spec: {
          containers: [
            {
              name: 'pod1-container',
              image: 'verdaccio/verdaccio',
              ports: [
                {
                  containerPort: 4873,
                },
              ],
            },
          ],
        },
      },
    },
  })
  console.log('Created deployment')
  await sleep()
}

async function addNewImageToDeployment(namespace: string, deployment: string): Promise<void> {
  console.log('Adding new image to existing deployment')
  await k8sAppsApi.patchNamespacedDeployment(deployment, namespace, {
    spec: {
      template: {
        spec: {
          containers: [
            {
              name: 'pod2-container',
              image: 'nginx',
              ports: [
                {
                  containerPort: 80,
                },
              ],
            },
          ],
        },
      },
    },
  })
  console.log('added new image to existing deployment')
  await sleep()
}

async function listDeployments(namespace: string) {
  console.log('listing all deployments')
  const response = await k8sAppsApi.listNamespacedDeployment(namespace)
  console.log(JSON.stringify(response.body.items, null, 2))
}

async function deleteNamespace(namespace: string) {
  console.log('deleting old namespace')
  await k8sApi.deleteNamespace(namespace).catch(() => {})
  await sleep()
}

async function createService(namespace: string, service: string) {
  console.log('creating new service')
  await k8sApi.createNamespacedService(namespace, {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: service,
      labels: {
        'service-key1': 'service-value1',
      },
    },
    spec: {
      type: 'NodePort',
      selector: {
        'pod-key1': 'pod-value1',
      },
      ports: [
        {
          port: 4873,
        },
      ],
    },
  })
  console.log('created new service')
}

async function getMasterAddress(): Promise<string> {
  const response = await k8sApi.listNode(undefined, false, undefined, undefined, 'node-role.kubernetes.io/master')
  const items = response.body.items
  if (items.length !== 1) {
    throw new Error('could not find a single master-node to extract its address')
  }
  const result = items[0].status?.addresses?.find(address => address.type === 'InternalIP')
  if (!result?.address) {
    throw new Error(`could not find the address of the master node. master node: ${JSON.stringify(items[0], null, 0)}`)
  }
  return result.address
}

// combined with getMasterAddress(), access a specific service in the deployment
async function getServiceNodePort(namespace: string, serviceLabelSelector: string): Promise<number> {
  const response = await k8sApi.listNamespacedService(
    namespace,
    undefined,
    false,
    undefined,
    undefined,
    serviceLabelSelector,
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

async function getAddressWithPortOfService(namespace: string, serviceLabelSelector: string): Promise<string> {
  const [address, port] = await Promise.all([getMasterAddress(), getServiceNodePort(namespace, serviceLabelSelector)])
  return `${address}:${port}`
}

async function main() {
  try {
    console.log(await getAddressWithPortOfService('default', 'service-key1'))
    // await deleteNamespace(namespace.metadata.name)
    // await createNamespace()
    // await createDeployment('default', 'stav-deployment1')
    // await listDeployments('default')
    // await createService('default', 'stav-service1')
  } catch (e) {
    console.error(e.response?.body?.message || e)
  }
}

main()
