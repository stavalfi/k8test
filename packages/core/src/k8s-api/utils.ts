import { SingletoneStrategy } from '../types'
import chance from 'chance'
import * as k8s from '@kubernetes/client-node'
import http from 'http'
import { Labels } from './types'

export const generateString = ({ resourceScope, imageName }: { resourceScope: string; imageName: string }) =>
  `${resourceScope}-${imageName.replace('/', '-')}`

export const generateResourceLabels = ({
  appId,
  singletoneStrategy,
  imageName,
  resourceScope,
}: {
  appId: string
  imageName: string
  singletoneStrategy: SingletoneStrategy
  resourceScope: string
}) => ({
  'image-name': imageName,
  'app-id': appId,
  'singletone-strategy': singletoneStrategy,
  'resourse-scope': resourceScope,
})

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
}): { resourceName: string; resourceScope: string } => {
  switch (singletoneStrategy) {
    case SingletoneStrategy.many: {
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
    case SingletoneStrategy.namespace: {
      const resourceScope = `${namespaceName}-${appId}`
      return {
        resourceName: generateString({
          resourceScope,
          imageName,
        }),
        resourceScope,
      }
    }
    case SingletoneStrategy.appId: {
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

export async function createResource<Resource extends k8s.V1Service | k8s.V1Deployment>(options: {
  appId: string
  namespaceName: string
  imageName: string
  singletoneStrategy: SingletoneStrategy
  create: (
    resourceName: string,
    labels: Labels,
  ) => Promise<{
    response: http.IncomingMessage
    body: Resource
  }>
  find: (resourceName: string) => Promise<Resource>
  waitUntilCreated: (resourceName: string) => Promise<Resource>
}): Promise<Resource> {
  const { resourceName, resourceScope } = generateResourceName({
    appId: options.appId,
    imageName: options.imageName,
    namespaceName: options.namespaceName,
    singletoneStrategy: options.singletoneStrategy,
  })
  try {
    await options.create(
      resourceName,
      generateResourceLabels({
        appId: options.appId,
        imageName: options.imageName,
        resourceScope: resourceScope,
        singletoneStrategy: options.singletoneStrategy,
      }),
    )
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
      if (resource.metadata?.labels?.['singletone-strategy'] === singletoneStrategy) {
        return resource
      } else {
        throw new Error(
          `there is a bug in the code. we should be here: it looks like we created a resource with "SingletoneStrategy.namespace" but its label tells us it has a different SingletoneStrategy: ${resource.metadata?.labels?.['singletone-strategy']}`,
        )
      }
    }
  } else {
    throw error
  }
}
