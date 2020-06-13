import chance from 'chance'
import http from 'http'
import { SingletonStrategy } from './types'
import { K8sResource, Labels } from './types'

const validateImageName = (imageName: string): string => imageName.split('/').join('-')

export const generateResourceLabels = ({
  appId,
  singletonStrategy,
  imageName,
}: {
  appId: string
  imageName?: string
  singletonStrategy: SingletonStrategy
}) => ({
  k8test: 'true',
  'app-id': appId,
  'singleton-strategy': singletonStrategy,
  ...(imageName && { image: validateImageName(imageName) }),
})

export const generateResourceName = ({
  appId,
  imageName,
  namespaceName,
  singletonStrategy,
}: {
  appId: string
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

  const withImageName = imageName ? `-${validateImageName(imageName)}` : ''
  switch (singletonStrategy) {
    case SingletonStrategy.oneInNamespace:
      return `${namespaceName}${withImageName}`
    case SingletonStrategy.oneInAppId:
      return `${appId}${withImageName}`
    case SingletonStrategy.manyInAppId:
      return `${letter}${hash}-${appId}${withImageName}`
  }
}

export async function createResource<Resource extends K8sResource>(options: {
  appId: string
  namespaceName: string
  imageName?: string
  singletonStrategy: SingletonStrategy
  create: (
    resourceName: string,
    labels: Labels,
  ) => Promise<{
    response: http.IncomingMessage
    body: Resource
  }>
  waitUntilReady: (resourceName: string) => Promise<Resource>
}): Promise<{ resource: Resource; isNewResource: boolean }> {
  const resourceName = generateResourceName({
    appId: options.appId,
    imageName: options.imageName,
    namespaceName: options.namespaceName,
    singletonStrategy: options.singletonStrategy,
  })
  try {
    await options.create(
      resourceName,
      generateResourceLabels({
        appId: options.appId,
        imageName: options.imageName,
        singletonStrategy: options.singletonStrategy,
      }),
    )
  } catch (error) {
    if (isResourceAlreadyExistError(error)) {
      return {
        resource: await options.waitUntilReady(resourceName),
        isNewResource: false,
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
// the event loop will be drained so the program will exit and won't be holded until the timeout finish.
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
