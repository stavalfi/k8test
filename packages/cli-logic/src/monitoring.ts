import got from 'got'
import {
  ConnectionFrom,
  createK8sClient,
  createNamespaceIfNotExist,
  deleteNamespaceIf,
  deleteResourceIf,
  deleteRolesIf,
  ExposeStrategy,
  generateResourceName,
  getDeployedImageConnectionDetails,
  grantAdminRoleToCluster,
  K8sClient,
  SingletonStrategy,
  subscribeToImage,
  generateResourceLabels,
} from 'k8s-api'
import k8testLog from 'k8test-log'
import { waitUntilReady } from './utils'

const log = k8testLog('cli-logic:monitoring')

const monitoringResourceName = (namespaceName: string) =>
  generateResourceName({
    imageName: 'stavalfi/k8test-monitoring',
    namespaceName: namespaceName,
    singletonStrategy: SingletonStrategy.oneInNamespace,
  })

async function isMonitoringServiceAlive(k8sClient: K8sClient, namespaceName: string) {
  try {
    const { deployedImageUrl } = await getDeployedImageConnectionDetails({
      k8sClient,
      exposeStrategy: ExposeStrategy.userMachine,
      namespaceName,
      serviceName: monitoringResourceName(namespaceName),
    })
    await got.get(`${deployedImageUrl}/is-alive`, {
      timeout: 1000,
    })
    log(
      'image "%s" is reachable using the address: "%s" from outside the cluster',
      'k8test-monitoring',
      deployedImageUrl,
    )
    return true
  } catch {
    return false
  }
}

export async function startMonitoring(options: { 'local-image': boolean; namespace: string }) {
  const k8sClient = createK8sClient(ConnectionFrom.outsideCluster)
  log(`created k8s-cleant object for interacting with %s`, options.namespace)

  const namespaceName = options.namespace

  if (await isMonitoringServiceAlive(k8sClient, namespaceName)) {
    return
  }
  log(`monitoring service is not alive. invoking monitoring service...`)

  await createNamespaceIfNotExist({
    k8sClient,
    namespaceName,
  })

  log(`created namespace: "%s"`, options.namespace)

  await grantAdminRoleToCluster({
    k8sClient,
    namespaceName,
    roleName: generateResourceName({
      namespaceName,
      singletonStrategy: SingletonStrategy.oneInNamespace,
    }),
    roleLabels: generateResourceLabels({
      singletonStrategy: SingletonStrategy.oneInNamespace,
    }),
  })

  log(`grant admin-privilages to cluster: "%s"`, options.namespace)

  const monitoringDeployedImage = await subscribeToImage({
    k8sClient,
    namespaceName: namespaceName,
    imageName: 'stavalfi/k8test-monitoring',
    imagePort: 80,
    exposeStrategy: ExposeStrategy.userMachine,
    singletonStrategy: SingletonStrategy.oneInNamespace,
    ...(options['local-image'] && {
      containerOptions: { imagePullPolicy: 'Never' },
    }),
  })

  log(
    'waiting until the service in image "%s" is reachable using the address: "%s" from outside the cluster',
    'k8test-monitoring',
    monitoringDeployedImage.deployedImageUrl,
  )

  await waitUntilReady(() =>
    got.get(`${monitoringDeployedImage.deployedImageUrl}/is-alive`, {
      timeout: 1000,
    }),
  )

  log(
    'image "%s" is reachable using the address: "%s" from outside the cluster',
    'k8test-monitoring',
    monitoringDeployedImage.deployedImageUrl,
  )
}

export async function deleteK8testResources(options: { namespace: string }) {
  const k8sClient = createK8sClient(ConnectionFrom.outsideCluster)

  const namespaceName = options.namespace

  if (namespaceName) {
    log('deleting all k8test resources in (or related to) namespace: "%s"', namespaceName)
    if (namespaceName === 'default') {
      await deleteResourceIf({
        k8sClient,
        namespaceName,
        predicate: resource => resource.metadata?.labels?.['k8test'] === 'true',
      })
    } else {
      await deleteNamespaceIf({ k8sClient, predicate: namespaceName1 => namespaceName1 === namespaceName })
    }
    await deleteRolesIf({
      k8sClient,
      predicate: resource =>
        resource.metadata?.labels?.['k8test'] === 'true' && resource.metadata?.namespace === namespaceName,
    })
    log('deleted all k8test resources in (or related to) namespace: "%s"', namespaceName)
  } else {
    log('deleting all k8test resources in all namespaces')
    log('deleting all k8test namespaces')
    await deleteNamespaceIf({ k8sClient, predicate: namespaceName => namespaceName.startsWith('k8test') })
    log('deleting all k8test resources in namespace: "%s"', 'default')
    await deleteResourceIf({
      k8sClient,
      namespaceName: 'default',
      predicate: resource => resource.metadata?.labels?.['k8test'] === 'true',
    })
    log('deleting all cluster roles')
    await deleteRolesIf({
      k8sClient,
      predicate: resource => resource.metadata?.labels?.['k8test'] === 'true',
    })
    log('deleted all k8test resources in all namespaces')
  }
}
