export enum NamespaceStrategy {
  default = 'default',
  k8test = 'k8test',
  custom = 'custom',
}

export type Namespace =
  | { namespaceStrategy: NamespaceStrategy.default }
  | { namespaceStrategy: NamespaceStrategy.k8test }
  | { namespaceStrategy: NamespaceStrategy.custom; namespace: string }

export type Subscription = {
  getDeployedImageUrl: () => Promise<string>
  getDeployedImageAddress: () => Promise<string>
  getDeployedImagePort: () => Promise<number>
  unsubscribe: () => Promise<void>
}

export type SubscribeCreatorOptions = {
  appId: string
  namespace?: Namespace
  ttlMs?: number
  imageName: string
  isSingelton?: boolean
  containerPortToExpose: number
}

export type SubscribeCreator = (options: SubscribeCreatorOptions) => Promise<Subscription>

export type Subscribe = (
  imageName: string,
  options: Pick<SubscribeCreatorOptions, 'isSingelton' | 'containerPortToExpose'>,
) => Promise<Subscription>
