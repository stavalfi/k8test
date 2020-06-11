import chance from 'chance'
import http from 'http'
import { SingletonStrategy } from './types'
import { K8sResource, Labels } from './types'

export const generateString = ({ resourceScope, imageName }: { resourceScope: string; imageName: string }) =>
  `${resourceScope}-${imageName.replace('/', '-')}`

export const generateResourceLabels = ({
  appId,
  singletonStrategy,
  imageName,
  resourceScope,
}: {
  appId: string
  imageName: string
  singletonStrategy: SingletonStrategy
  resourceScope: string
}) => ({
  k8test: 'true',
  'image-name': imageName,
  'app-id': appId,
  'singleton-strategy': singletonStrategy,
  'resource-scope': resourceScope,
})

export const generateResourceName = ({
  appId,
  imageName,
  namespaceName,
  singletonStrategy,
}: {
  appId: string
  namespaceName: string
  imageName: string
  singletonStrategy: SingletonStrategy
}): { resourceName: string; resourceScope: string } => {
  switch (singletonStrategy) {
    case SingletonStrategy.many: {
      const resourceScope = `${chance()
        .letter()
        .toLocaleLowerCase()}${chance()
        .hash()
        .toLocaleLowerCase()
        .slice(0, 5)}-${appId}`
      return {
        resourceName: generateString({
          resourceScope,
          imageName,
        }),
        resourceScope,
      }
    }
    case SingletonStrategy.namespace: {
      const resourceScope = `${namespaceName}-${appId}`
      return {
        resourceName: generateString({
          resourceScope,
          imageName,
        }),
        resourceScope,
      }
    }
    case SingletonStrategy.appId: {
      const resourceScope = appId
      return {
        resourceName: generateString({
          resourceScope,
          imageName,
        }),
        resourceScope,
      }
    }
  }
}

export async function createResource<Resource extends K8sResource>(options: {
  appId: string
  namespaceName: string
  imageName: string
  singletonStrategy: SingletonStrategy
  create: (
    resourceName: string,
    labels: Labels,
  ) => Promise<{
    response: http.IncomingMessage
    body: Resource
  }>
  find: (resourceName: string) => Promise<Resource>
  waitUntilCreated: (resourceName: string) => Promise<Resource>
}): Promise<{ resource: Resource; isNewResource: boolean }> {
  const { resourceName, resourceScope } = generateResourceName({
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
        resourceScope: resourceScope,
        singletonStrategy: options.singletonStrategy,
      }),
    )
  } catch (error) {
    return {
      resource: await shouldIgnoreAlreadyExistError({
        singletonStrategy: options.singletonStrategy,
        findResource: () => options.find(resourceName),
        error,
      }),
      isNewResource: false,
    }
  }
  return {
    resource: await options.waitUntilCreated(resourceName),
    isNewResource: true,
  }
}

export function isResourceAlreadyExistError(error: any): boolean {
  return error?.response?.statusCode === 409 && error?.response?.body?.reason === 'AlreadyExists'
}

export async function shouldIgnoreAlreadyExistError<Resource extends K8sResource>({
  singletonStrategy,
  findResource,
  error,
}: {
  singletonStrategy: SingletonStrategy
  findResource: () => Promise<Resource>
  error: any
}): Promise<Resource> {
  if (isResourceAlreadyExistError(error)) {
    if (singletonStrategy === SingletonStrategy.many) {
      throw new Error(
        'there is a bug in the code. we should not be here: it looks like we generated 2 resources names with the same random-identifier. wierd.',
      )
    } else {
      const resource = await findResource()
      if (resource.metadata?.labels?.['singleton-strategy'] === singletonStrategy) {
        return resource
      } else {
        throw new Error(
          `there is a bug in the code. we should not be here: it looks like we created a resource with "SingletonStrategy.namespace" but its label tells us it has a different SingletonStrategy: ${resource.metadata?.labels?.['singleton-strategy']}`,
        )
      }
    }
  } else {
    throw error
  }
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
