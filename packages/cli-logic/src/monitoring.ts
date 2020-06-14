import got from 'got'
import {
  ConnectionFrom,
  createK8sClient,
  createNamespaceIfNotExist,
  ExposeStrategy,
  grantAdminRoleToCluster,
  SingletonStrategy,
  subscribeToImage,
  generateResourceName,
  getDeployedImageConnectionDetails,
  unsubscribeFromImage,
  K8sClient,
} from 'k8s-api'
import k8testLog from 'k8test-log'
import { waitUntilReady } from './utils'
import { NotFoundError } from 'k8s-api'

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
    return true
  } catch {
    return false
  }
}

export async function startMonitoring(options: { 'local-image': boolean; namespace: string }) {
  const k8sClient = createK8sClient(ConnectionFrom.outsideCluster)

  const namespaceName = options.namespace

  if (await isMonitoringServiceAlive(k8sClient, namespaceName)) {
    return
  }

  await grantAdminRoleToCluster(k8sClient)

  await createNamespaceIfNotExist({
    k8sClient,
    namespaceName,
  })

  const monitoringDeployedImage = await subscribeToImage({
    k8sClient,
    namespaceName: namespaceName,
    imageName: 'stavalfi/k8test-monitoring',
    containerPortToExpose: 80,
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

export async function deleteMonitoring(options: { namespace: string }) {
  try {
    const k8sClient = createK8sClient(ConnectionFrom.outsideCluster)

    const namespaceName = options.namespace

    const { deployedImageUrl } = await getDeployedImageConnectionDetails({
      k8sClient,
      exposeStrategy: ExposeStrategy.userMachine,
      namespaceName,
      serviceName: monitoringResourceName(namespaceName),
    })
    await got.delete(`${deployedImageUrl}/delete-internal-resources`)

    await unsubscribeFromImage({
      k8sClient,
      imageName: 'stavalfi/k8test-monitoring',
      namespaceName: namespaceName,
      singletonStrategy: SingletonStrategy.oneInNamespace,
      deploymentName: monitoringResourceName(namespaceName),
      serviceName: monitoringResourceName(namespaceName),
      forceDelete: true,
    })
  } catch (e) {
    if (e instanceof NotFoundError) {
      // eslint-disable-next-line no-console
      console.error('monitoring service was not found')
      process.exitCode = 1
      return
    } else {
      throw e
    }
  }
}
