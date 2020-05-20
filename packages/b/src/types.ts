export enum NamespaceStrategy {
  default = 'default',
  new = 'new',
  custom = 'custom',
}

export type Namespace =
  | { namespaceStrategy: NamespaceStrategy.default }
  | { namespaceStrategy: NamespaceStrategy.new }
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
  image: string
  isSingelton?: boolean
  containerPortToExpose?: number
}

export type SubscribeCreator = (options: SubscribeCreatorOptions) => Promise<Subscription>

export type Subscribe = (
  image: string,
  options?: Pick<SubscribeCreatorOptions, 'isSingelton' | 'containerPortToExpose'>,
) => Promise<Subscription>
