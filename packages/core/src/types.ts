import { SingletonStrategy } from 'k8s-api'
import { ContainerOptions } from 'k8s-api/src/types'

export type Subscription = {
  deployedImageUrl: string
  deployedImageAddress: string
  deployedImagePort: number
  unsubscribe: () => Promise<void>
}

export type SubscribeCreatorOptions = {
  appId?: string
  imageName: string
  postfix?: string // incase you want to have multiple singleton instances (oneInAppId,oneInNamespace) of same kind
  singletonStrategy?: SingletonStrategy
  imagePort: number
  containerOptions?: ContainerOptions
  namespaceName?: string
  isReadyPredicate?: (
    deployedImageUrl: string,
    deployedImageAddress: string,
    deployedImagePort: number,
  ) => Promise<unknown>
}

export type SubscribeCreator = (options: SubscribeCreatorOptions) => Promise<Subscription>
