import got from 'got'
import { randomAppId, subscribe } from '../src'
import { isServiceReadyPredicate, prepareEachTest, randomNamespaceName } from './utils'

describe('reach endpoints in the cluster', () => {
  const { cleanups, startMonitorNamespace, registerNamespaceRemoval } = prepareEachTest()

  test('endpoint is available while the endpoint has active subscription', async () => {
    const namespaceName = randomNamespaceName()
    await startMonitorNamespace(namespaceName)
    const appId = randomAppId()

    const { unsubscribe, deployedImageUrl } = await subscribe({
      imageName: 'stavalfi/simple-service',
      containerPortToExpose: 80,
      containerOptions: { imagePullPolicy: 'Never' },
      namespaceName,
      appId,
      isReadyPredicate: isServiceReadyPredicate,
    })

    cleanups.push(unsubscribe)
    registerNamespaceRemoval(namespaceName)

    await expect(got.get(`${deployedImageUrl}/is-alive`, { resolveBodyOnly: true })).resolves.toEqual('true')
  })

  test('endpoint is not available after unsubscribe', async () => {
    const namespaceName = randomNamespaceName()
    await startMonitorNamespace(namespaceName)
    const appId = randomAppId()
    registerNamespaceRemoval(namespaceName)

    const { unsubscribe, deployedImageUrl } = await subscribe({
      imageName: 'stavalfi/simple-service',
      containerPortToExpose: 80,
      containerOptions: { imagePullPolicy: 'Never' },
      namespaceName,
      appId,
      isReadyPredicate: isServiceReadyPredicate,
    })

    await unsubscribe()

    await expect(got.get(`${deployedImageUrl}/is-alive`, { timeout: 50 })).rejects.toThrow(
      expect.objectContaining({ name: expect.stringMatching(/TimeoutError|RequestError/) }),
    )
  })
})
