import * as k8s from '@kubernetes/client-node'

export const waitUntilNamespaceReady = (namespaceName: string, options: { watchClient: k8s.Watch }) =>
  waitUntilResourceReady<k8s.V1Namespace>({
    watchClient: options.watchClient,
    api: `/apis/apps/v1/namespaces`,
    resouceName: namespaceName,
  })

export const waitUntilDeploymentReady = (deploymentName: string, options: { watchClient: k8s.Watch }) =>
  waitUntilResourceReady<k8s.V1Namespace>({
    watchClient: options.watchClient,
    api: `/apis/apps/v1/namespaces/${deploymentName}/deployments`,
    resouceName: deploymentName,
  })

export const waitUntilDeploymentDeleted = (deploymentName: string, options: { watchClient: k8s.Watch }) =>
  waitUntilResourceReady<k8s.V1Namespace>({
    watchClient: options.watchClient,
    api: `/apis/apps/v1/namespaces/${deploymentName}/deployments`,
    resouceName: deploymentName,
  })

export const waitUntilServiceReady = (serviceName: string, options: { watchClient: k8s.Watch }) =>
  waitUntilResourceReady<k8s.V1Namespace>({
    watchClient: options.watchClient,
    api: `/apis/apps/v1/namespaces/${serviceName}/services`,
    resouceName: serviceName,
  })

export const waitUntilServiceDeleted = (serviceName: string, options: { watchClient: k8s.Watch }) =>
  waitUntilResourceReady<k8s.V1Namespace>({
    watchClient: options.watchClient,
    api: `/apis/apps/v1/namespaces/${serviceName}/services`,
    resouceName: serviceName,
  })

async function waitUntilResourceReady<Resource extends { metadata?: { name?: string } }>(options: {
  watchClient: k8s.Watch
  api: string
  resouceName: string
}): Promise<void> {
  await new Promise((res, rej) => {
    options.watchClient.watch(
      options.api,
      {},
      (type, obj) => {
        switch (type) {
          case 'ADDED': {
            const deployment = obj as k8s.V1Deployment
            if (deployment.metadata?.name === options.resouceName) {
              res()
            }
          }
        }
      },
      err =>
        err
          ? rej(err)
          : rej(
              `watch was terminated noramlly but the resource is still not created or in ready-state. resource api: ${options.api}, resouce-name: ${options.resouceName}`,
            ),
    )
  })
}
