/// <reference path="../../../declarations.d.ts" />

import chance from 'chance'
import http from 'http'
import { SingletonStrategy } from './types'
import { K8sResource, Labels } from './types'
import objectDeepContain from 'object-deep-contain'

export const randomAppId = () =>
  `app-id-${chance()
    .hash()
    .slice(0, 10)}`

const validateImageName = (imageName: string): string => imageName.split('/').join('-')

export const generateResourceLabels = ({
  appId,
  singletonStrategy,
  imageName,
}: {
  appId?: string
  imageName?: string
  singletonStrategy: SingletonStrategy
}) => {
  const letter = chance()
    .letter()
    .toLocaleLowerCase()
  const hash = chance()
    .hash()
    .toLocaleLowerCase()
  return {
    k8test: 'true',
    'singleton-strategy': singletonStrategy,
    'k8test-resource-id': `${letter}${hash}`,
    ...(appId && { 'app-id': appId }),
    ...(imageName && { image: validateImageName(imageName) }),
  }
}

export const generateResourceName = ({
  appId,
  imageName,
  namespaceName,
  singletonStrategy,
}: {
  appId?: string
  namespaceName: string
  imageName?: string
  singletonStrategy: SingletonStrategy
}): string => {
  const letter = chance()
    .letter()
    .toLocaleLowerCase()
  const hash = chance()
    .hash()
    .toLocaleLowerCase()
    .slice(0, 5)

  const validatedImageName = imageName ? validateImageName(imageName) : ''
  switch (singletonStrategy) {
    case SingletonStrategy.oneInNamespace:
      return `${namespaceName}-${validatedImageName}`
    case SingletonStrategy.oneInAppId:
      return `${appId}-${validatedImageName}`
    case SingletonStrategy.manyInAppId:
      return `${letter}${hash}-${appId}-${validatedImageName}`
  }
}

export async function createResource<Resource extends K8sResource>(options: {
  appId?: string
  namespaceName: string
  imageName?: string
  singletonStrategy: SingletonStrategy
  createResource: (resourceName: string, labels: Labels) => Resource
  createInK8s: (
    resourceToCreate: Resource,
  ) => Promise<{
    response: http.IncomingMessage
    body: Resource
  }>
  deleteResource: (resourceName: string) => Promise<unknown>
  waitUntilReady: (resourceName: string) => Promise<Resource>
  failFastIfExist?: boolean
}): Promise<{ resource: Resource; isNewResource: boolean }> {
  const resourceName = generateResourceName({
    appId: options.appId,
    imageName: options.imageName,
    namespaceName: options.namespaceName,
    singletonStrategy: options.singletonStrategy,
  })
  const resourceToCreate = options.createResource(
    resourceName,
    generateResourceLabels({
      appId: options.appId,
      imageName: options.imageName,
      singletonStrategy: options.singletonStrategy,
    }),
  )
  try {
    await options.createInK8s(resourceToCreate)
  } catch (error) {
    if (isResourceAlreadyExistError(error)) {
      const resource = await options.waitUntilReady(resourceName)
      if (objectDeepContain(resource, resourceToCreate)) {
        return {
          resource,
          isNewResource: false,
        }
      } else {
        // the existing resource is not valid anymore.
        if (options.failFastIfExist) {
          throw new Error(
            `resource "${resourceName}" already exist and it is not valid any more. please manually remove it and start your application again. we are sorry for the inconvenience but we do not have a solution for this edge-case.`,
          )
        } else {
          await options.deleteResource(resourceName)
          return createResource(options)
        }
      }
    } else {
      throw error
    }
  }
  return {
    resource: await options.waitUntilReady(resourceName),
    isNewResource: true,
  }
}

export function isResourceAlreadyExistError(error: any): boolean {
  return error?.response?.statusCode === 409 && error?.response?.body?.reason === 'AlreadyExists'
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
