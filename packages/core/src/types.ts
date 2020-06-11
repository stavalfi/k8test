import { SingletonStrategy } from 'k8s-api'

export type Subscription = {
  deployedImageUrl: string
  deployedImageAddress: string
  deployedImagePort: number
  unsubscribe: () => Promise<void>
}

export type SubscribeCreatorOptions = {
  appId?: string
  ttlMs?: number
  imageName: string
  singletonStrategy?: SingletonStrategy
  containerPortToExpose: number
  isReadyPredicate?: (
    deployedImageUrl: string,
    deployedImageAddress: string,
    deployedImagePort: number,
  ) => Promise<void>
}

export type SubscribeCreator = (options: SubscribeCreatorOptions) => Promise<Subscription>
