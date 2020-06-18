/// <reference path="../../../declarations.d.ts" />

import chance from 'chance'
import http from 'http'
import objectDeepContain from 'object-deep-contain'
import objectDeleteKey from 'object-delete-key'
import { K8sResource, Labels, SingletonStrategy, SubscriptionOperation } from './types'

export const randomAppId = () =>
  `app-id-${chance()
    .hash()
    .slice(0, 10)}`

const validateImageName = (imageName: string): string => imageName.split('/').join('-')

export function isResourceAlreadyExistError(error?: {
  response?: { statusCode?: number; body?: { reason?: string } }
}): boolean {
  return error?.response?.statusCode === 409 && error?.response?.body?.reason === 'AlreadyExists'
}

function isK8testLabel(key: string) {
  return key.startsWith('k8test')
}

export const generateResourceLabels = ({
  appId,
  singletonStrategy,
  imageName,
  postfix,
}: {
  appId?: string
  imageName?: string
  singletonStrategy: SingletonStrategy
  postfix?: string
}) => {
  return {
    k8test: 'true',
    'k8test-singleton-strategy': singletonStrategy,
    ...(appId && { 'k8test-app-id': appId }),
    ...(imageName && { 'k8test-image': validateImageName(imageName) }),
    ...(postfix && { 'k8test-postfix': postfix }),
  }
}

export const generateResourceName = ({
  appId,
  imageName,
  namespaceName,
  singletonStrategy,
  postfix,
}: {
  appId?: string
  namespaceName: string
  imageName?: string
  singletonStrategy: SingletonStrategy
  postfix?: string
}): string => {
  const validatedImageName = imageName ? validateImageName(imageName) : ''
  const join = (values: (string | undefined)[]) => values.filter(Boolean).join('-')
  switch (singletonStrategy) {
    case SingletonStrategy.oneInNamespace:
      return join([namespaceName, validatedImageName, postfix])
    case SingletonStrategy.oneInAppId:
    case SingletonStrategy.manyInAppId:
      return join([appId, validatedImageName, postfix])
  }
}

export function isTempResource(resource: K8sResource): boolean {
  const singletonStrategy = resource.metadata?.labels?.['k8test-singleton-strategy']
  switch (singletonStrategy) {
    case SingletonStrategy.oneInNamespace:
      return false
    case SingletonStrategy.manyInAppId:
    case SingletonStrategy.oneInAppId:
      return true
    default:
      return false
  }
}

export function getSubscriptionLabel(operation: SubscriptionOperation) {
  return {
    [`k8test-subscription-${chance()
      .hash()
      .slice(0, 10)}`]: operation,
  }
}

export function isSubscriptionLabel(key: string, value: string): boolean {
  return (
    isK8testLabel(key) &&
    key.startsWith('k8test-subscription-') &&
    (value === SubscriptionOperation.subscribe || value === SubscriptionOperation.unsubscribe)
  )
}

function removeDeepProps(obj: object, keys: string[]): object {
  return keys.reduce((acc, key) => objectDeleteKey(acc, { cleanup: false, key }), obj)
}

export async function createResource<Resource extends K8sResource>(options: {
  appId?: string
  namespaceName: string
  imageName?: string
  singletonStrategy: SingletonStrategy
  resourceName: string
  resourcesLabels: Labels
  createResource: () => Resource
  createInK8s: (
    resourceToCreate: Resource,
  ) => Promise<{
    response: http.IncomingMessage
    body: Resource
  }>
  deleteResource: () => Promise<unknown>
  waitUntilReady: () => Promise<Resource>
}): Promise<{ resource: Resource; isNewResource: boolean }> {
  const resourceToCreate = options.createResource()
  try {
    await options.createInK8s(resourceToCreate)
  } catch (error) {
    if (isResourceAlreadyExistError(error)) {
      const resource = await options.waitUntilReady()
      const resourceToCreateClone = removeDeepProps(resourceToCreate, ['k8test-subscription-*', 'serviceAccount'])

      if (
        objectDeepContain(
          // this is a workaround to compare only the json properties and exclude everything else
          JSON.parse(JSON.stringify(resource, null, 2)),
          JSON.parse(JSON.stringify(resourceToCreateClone, null, 2)),
        )
      ) {
        return {
          resource,
          isNewResource: false,
        }
      } else {
        await options.deleteResource()
        return createResource(options)
      }
    } else {
      throw error
    }
  }
  return {
    resource: await options.waitUntilReady(),
    isNewResource: true,
  }
}

// improved promise-based timeout to ensure that if there was no timeout,
// the event loop will be drained so the program will exit and won't be hold until the timeout finish.
export async function timeout<T>(promise1: Promise<T>, timeoutMs: number) {
  let timeoutId: NodeJS.Timeout
  let res: () => void
  await Promise.race([promise1, new Promise((res, rej) => (timeoutId = setTimeout(() => rej(`timeout`), timeoutMs)))])
  // @ts-ignore
  if (timeoutId) {
    clearTimeout(timeoutId)
  }
  // @ts-ignore
  if (res) {
    res()
  }
  // If there is timeout, I won't come here
  return promise1
}
