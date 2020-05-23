import { SingletoneStrategy } from '../types'
import chance from 'chance'
import * as k8s from '@kubernetes/client-node'
import http from 'http'

export const generateLabel = ({ appId, imageName, postfix }: { appId: string; imageName: string; postfix: string }) =>
  `${appId}-${imageName.replace('/', '-')}-${postfix}`

export const generateString = ({ scope, imageName }: { scope: string; imageName: string }) =>
  `${scope}-${imageName.replace('/', '-')}`

export const generateResourceName = ({
  appId,
  imageName,
  namespaceName,
  singletoneStrategy,
}: {
  appId: string
  namespaceName: string
  imageName: string
  singletoneStrategy: SingletoneStrategy
}): string => {
  switch (singletoneStrategy) {
    case SingletoneStrategy.many:
      return generateString({
        scope: `${chance()
          .letter()
          .toLocaleLowerCase()}${chance()
          .hash()
          .toLocaleLowerCase()
          .slice(0, 5)}-${appId}`,
        imageName,
      })
    case SingletoneStrategy.namespace:
      return generateString({
        scope: `${namespaceName}-${appId}`,
        imageName,
      })
    case SingletoneStrategy.appId:
      return generateString({
        scope: appId,
        imageName,
      })
  }
}

export async function createResource<Resource extends k8s.V1Service | k8s.V1Deployment>(options: {
  appId: string
  namespaceName: string
  imageName: string
  singletoneStrategy: SingletoneStrategy
  create: (
    resourceName: string,
  ) => Promise<{
    response: http.IncomingMessage
    body: Resource
  }>
  find: (resourceName: string) => Promise<Resource>
  waitUntilCreated: (resourceName: string) => Promise<Resource>
}): Promise<Resource> {
  const resourceName = generateResourceName({
    appId: options.appId,
    imageName: options.imageName,
    namespaceName: options.namespaceName,
    singletoneStrategy: options.singletoneStrategy,
  })
  try {
    await options.create(resourceName)
  } catch (error) {
    return shouldIgnoreAlreadyExistError({
      singletoneStrategy: options.singletoneStrategy,
      findResource: () => options.find(resourceName),
      error,
    })
  }
  return options.waitUntilCreated(resourceName)
}

export function isResourceAlreadyExistError(error: any): boolean {
  return error?.response?.statusCode === 409 && error?.response?.body?.reason === 'AlreadyExists'
}

export async function shouldIgnoreAlreadyExistError<
  Resource extends k8s.V1Service | k8s.V1Deployment | k8s.V1Namespace
>({
  singletoneStrategy,
  findResource,
  error,
}: {
  singletoneStrategy: SingletoneStrategy
  findResource: () => Promise<Resource>
  error: any
}): Promise<Resource> {
  if (isResourceAlreadyExistError(error)) {
    if (singletoneStrategy === SingletoneStrategy.many) {
      throw new Error(
        'there is a bug in the code. we should be here: it looks like we generated 2 resources names with the same random-identifier. wierd.',
      )
    } else {
      const resource = await findResource()
      if (resource.metadata?.labels?.['is-singletone'] === singletoneStrategy) {
        return resource
      } else {
        throw new Error(
          `there is a bug in the code. we should be here: it looks like we created a resource with "SingletoneStrategy.namespace" but its label tells us it has a different SingletoneStrategy: ${resource.metadata?.labels?.['is-singletone']}`,
        )
      }
    }
  } else {
    throw error
  }
}
