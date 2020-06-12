import {
  ExposeStrategy,
  internalK8testResourcesAppId,
  K8sClient,
  k8testNamespaceName,
  SingletonStrategy,
  subscribeToImage,
} from 'k8s-api'
import k8testLog from 'k8test-log'

const log = k8testLog('core:setup-internal-redis')

export async function setupInternalRedis(k8sClient: K8sClient): Promise<void> {
  log('setting up redis for k8test internal use inside namespace "%s"', k8testNamespaceName())
  await subscribeToImage({
    k8sClient,
    appId: internalK8testResourcesAppId(),
    namespaceName: k8testNamespaceName(),
    imageName: 'redis',
    containerPortToExpose: 4873,
    exposeStrategy: ExposeStrategy.insideCluster,
    singletonStrategy: SingletonStrategy.oneInCluster,
  })
}
