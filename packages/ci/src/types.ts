export type PackageJson = {
  name: string
  version: string
  dependencies?: { [key: string]: string }
  devDependencies?: { [key: string]: string }
}

export type Auth = {
  npmRegistryToken: string
  gitServerUsername: string
  gitServerToken: string
  skipDockerRegistryLogin: boolean
  dockerRegistryUsername: string
  dockerRegistryToken: string
}

export enum TargetType {
  docker = 'docker',
  npm = 'npm',
}

export type TargetInfo<TargetTypParam extends TargetType> = { targetType: TargetTypParam } & (
  | {
      needPublish: true
      newVersion: string
      // if we didn't publish this hash yet, it maybe because we modified something or we never published before
      latestPublishedVersion?: { version: string; hash: string }
    }
  | {
      needPublish: false
      latestPublishedVersion: { version: string; hash: string }
    }
)

export type PackageInfo = {
  relativePackagePath: string
  packagePath: string
  packageHash: string
  packageJson: PackageJson
  target?: TargetInfo<TargetType.npm> | TargetInfo<TargetType.docker>
}

export type Node<T> = {
  data: T
  parentsIndexes: number[]
  childrenIndexes: number[]
}

export type Graph<T> = Node<T>[]

export type PromoteResult = {
  packagePath: string
  newVersion: string
}

export type PublishResult = {
  packagePath: string
  published: boolean
  newVersion?: string
}
