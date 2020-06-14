import { SingletonStrategy } from 'k8s-api'
import { ContainerOptions } from 'k8s-api/src/types'
import WebSocket from 'ws'

export type Subscription = {
  deployedImageUrl: string
  deployedImageAddress: string
  deployedImagePort: number
  unsubscribe: () => Promise<void>
  monitoringServiceContainerStdioAttachment?: WebSocket
}

export type SubscribeCreatorOptions = {
  appId?: string
  ttlMs?: number
  imageName: string
  singletonStrategy?: SingletonStrategy
  containerPortToExpose: number
  containerOptions?: ContainerOptions
  isReadyPredicate?: (
    deployedImageUrl: string,
    deployedImageAddress: string,
    deployedImagePort: number,
  ) => Promise<void>
  debugMonitoringService?: boolean
}

export type SubscribeCreator = (options: SubscribeCreatorOptions) => Promise<Subscription>
