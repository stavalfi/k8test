import { IPackageJson } from 'package-json-type'

export type Protocol = 'http' | 'https'

export type ServerInfo = {
  host: string
  port: number
  protocol?: Protocol
}

export type Auth = {
  npmRegistryUsername: string
  npmRegistryEmail: string
  npmRegistryToken: string
  gitServerUsername: string
  gitServerToken: string
  redisPassword?: string
  dockerRegistryUsername?: string
  dockerRegistryToken?: string
}

export type CiOptions = {
  rootPath: string
  isMasterBuild: boolean
  isDryRun: boolean
  skipTests: boolean
  npmRegistry: ServerInfo
  dockerRegistry: ServerInfo
  gitServer: ServerInfo
  redisServer: ServerInfo
  dockerOrganizationName: string
  gitRepositoryName: string
  gitOrganizationName: string
  auth: Auth
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
      latestPublishedVersion?: { version?: string; hash?: string }
    }
  | {
      needPublish: false
      latestPublishedVersion: { version?: string; hash?: string }
    }
)

export type PackageInfo = {
  relativePackagePath: string
  packagePath: string
  packageHash: string
  packageJson: IPackageJson
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
