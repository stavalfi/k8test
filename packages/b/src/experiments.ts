// /* eslint-disable no-console */
// import * as k8s from '@kubernetes/client-node'

// const kc = new k8s.KubeConfig()
// kc.loadFromDefault()

// const k8sApi = kc.makeApiClient(k8s.CoreV1Api)
// const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api)
// const watch = new k8s.Watch(kc)

// type Labels = { [key: string]: string }

// var namespace = {
//   metadata: {
//     name: 'test',
//   },
// }

// const sleep = () => new Promise(res => setTimeout(res, 2000))

// async function createNamespace() {
//   console.log('Creating new namespace')
//   await k8sApi.createNamespace(namespace)
//   console.log('Created namespace')
//   await sleep()
// }

// type RunImageResult = {
//   service: string
//   deployment: string
//   addressWithPort: string
//   serviceLabels: Labels
//   deploymentLabels: Labels
// }

// async function runImage(
//   image: string,
//   options: { namespace: string; containerPortToExpose: number },
// ): Promise<RunImageResult> {
//   const service = 'service1'
//   const deployment = 'deployment1'
//   const podsLabels: Labels = {
//     key1: 'value1',
//   }
//   const serviceLabels = { key2: 'value' }
//   const deploymentLabels = { key3: 'value' }
//   await createService(service, { namespace: options.namespace, podsLabels, serviceLabels })
//   await createDeployment(deployment, {
//     namespace: options.namespace,
//     podsLabels,
//     deploymentLabels,
//     image,
//     containerPortToExpose: options.containerPortToExpose,
//   })
//   const addressWithPort = await getAddressWithPortOfService({ namespace: options.namespace, serviceLabelKey: 'key2' })
//   return {
//     service,
//     deployment,
//     addressWithPort,
//     serviceLabels,
//     deploymentLabels,
//   }
// }

// async function createDeployment(
//   deployment: string,
//   options: {
//     namespace: string
//     deploymentLabels: Labels
//     podsLabels: Labels
//     image: string
//     containerPortToExpose: number
//   },
// ): Promise<void> {
//   console.log('Creating new deployment')
//   await k8sAppsApi.createNamespacedDeployment(options.namespace, {
//     apiVersion: 'apps/v1',
//     kind: 'Deployment',
//     metadata: {
//       name: deployment,
//       labels: options.deploymentLabels,
//     },
//     spec: {
//       replicas: 1,
//       selector: {
//         matchLabels: options.podsLabels,
//       },
//       template: {
//         metadata: {
//           name: 'pod1',
//           labels: options.podsLabels,
//         },
//         spec: {
//           containers: [
//             {
//               name: 'pod1-container',
//               image: options.image,
//               ports: [
//                 {
//                   containerPort: options.containerPortToExpose,
//                 },
//               ],
//             },
//           ],
//         },
//       },
//     },
//   })
//   console.log('Created deployment')
//   await sleep()
// }

// async function listDeployments(namespace: string) {
//   console.log('listing all deployments')
//   const response = await k8sAppsApi.listNamespacedDeployment(namespace)
//   console.log(JSON.stringify(response.body.items, null, 2))
// }

// async function deleteNamespace(namespace: string) {
//   console.log('deleting old namespace')
//   await k8sApi.deleteNamespace(namespace).catch(() => {})
//   await sleep()
// }

// async function createService(
//   service: string,
//   options: { namespace: string; serviceLabels: Labels; podsLabels: Labels },
// ) {
//   console.log('creating new service')
//   await k8sApi.createNamespacedService(options.namespace, {
//     apiVersion: 'v1',
//     kind: 'Service',
//     metadata: {
//       name: service,
//       labels: options.serviceLabels,
//     },
//     spec: {
//       type: 'NodePort',
//       selector: options.podsLabels,
//       ports: [
//         {
//           port: 4873,
//         },
//       ],
//     },
//   })
//   console.log('created new service')
// }

// async function getMasterAddress(): Promise<string> {
//   const response = await k8sApi.listNode(undefined, false, undefined, undefined, 'node-role.kubernetes.io/master')
//   const items = response.body.items
//   if (items.length !== 1) {
//     throw new Error('could not find a single master-node to extract its address')
//   }
//   const result = items[0].status?.addresses?.find(address => address.type === 'InternalIP')
//   if (!result?.address) {
//     throw new Error(`could not find the address of the master node. master node: ${JSON.stringify(items[0], null, 0)}`)
//   }
//   return result.address
// }

// // combined with getMasterAddress(), access a specific service in the deployment
// async function getServiceNodePort(options: { namespace: string; serviceLabelKey: string }): Promise<number> {
//   const response = await k8sApi.listNamespacedService(
//     options.namespace,
//     undefined,
//     false,
//     undefined,
//     undefined,
//     options.serviceLabelKey,
//   )
//   const items = response.body.items
//   if (items.length !== 1) {
//     throw new Error(
//       `could not find a specific service to extract the node-port from him. the response contains the following services: ${JSON.stringify(
//         items,
//         null,
//         2,
//       )}`,
//     )
//   }
//   const ports = items[0].spec?.ports
//   if (!ports || ports.length !== 1) {
//     throw new Error(
//       `could not find a the node port in the service. I expect a single port instance. it maybe because the service was created without specifying the port to expose from the pods it is matching to in the deployment. ports: ${JSON.stringify(
//         ports,
//         null,
//         2,
//       )}`,
//     )
//   }
//   const nodePort = ports[0].nodePort
//   if (!nodePort) {
//     throw new Error(
//       `could not find a the node port in the service. port instance: ${JSON.stringify(ports[0], null, 2)}`,
//     )
//   }
//   return nodePort
// }

// async function getAddressWithPortOfService(options: { namespace: string; serviceLabelKey: string }): Promise<string> {
//   const [address, port] = await Promise.all([getMasterAddress(), getServiceNodePort(options)])
//   return `${address}:${port}`
// }

// async function main() {
//   try {
//     // await deleteNamespace(namespace.metadata.name)
//     // await createNamespace()
//     // const result = await runImage('verdaccio/verdaccio', { namespace: 'default', containerPortToExpose: 4873 })
//     // console.log(JSON.stringify(result, null, 2))
//     watch.watch(
//       `/api/v1/namespaces/k8test/services`,
//       {},
//       (a, b) => console.log(a, JSON.stringify(b, null, 2)),
//       error => console.log(error),
//     )
//     watch.watch(
//       `/apis/apps/v1/namespaces/k8test/deployments`,
//       {},
//       (a, b) => console.log(a, JSON.stringify(b, null, 2)),
//       error => console.log(error),
//     )
//   } catch (e) {
//     console.error(e.response?.body?.message || e)
//   }
// }

// main()
