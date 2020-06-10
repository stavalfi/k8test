export enum NamespaceStrategy {
  default = 'default',
  k8test = 'k8test',
  custom = 'custom',
}

export type Namespace =
  | { namespaceStrategy: NamespaceStrategy.default }
  | { namespaceStrategy: NamespaceStrategy.k8test }
  | { namespaceStrategy: NamespaceStrategy.custom; namespaceName: string }

export type Subscription = {
  deployedImageUrl: string
  deployedImageAddress: string
  deployedImagePort: number
  unsubscribe: () => Promise<void>
}

export enum SingletonStrategy {
  many = 'many', // (default) always new container
  namespace = 'one-per-namespace', // one instance per namespace - e.g. k8test-internal-redis
  appId = 'one-per-app-id', // one instance per appId - e.g. user images
}

export type SubscribeCreatorOptions = {
  appId?: string
  namespace?: Namespace
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
