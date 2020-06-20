export type PackageJson = {
  name: string
  version: string
  dependencies?: { [key: string]: string }
  devDependencies?: { [key: string]: string }
}

export enum TargetType {
  docker = 'docker',
  npm = 'npm',
}

export type NpmTargetInfo = {
  targetType: TargetType.npm
  npm: {
    isAlreadyPublished: boolean
    latestVersion?: { version: string; hash: string }
  }
}

export type DockerTargetInfo = {
  targetType: TargetType.docker
  docker: {
    isAlreadyPublished: boolean
    latestTag?: { tag: string; hash: string }
  }
}

export type TargetInfo = NpmTargetInfo | DockerTargetInfo

export type PackageInfo = {
  packagePath: string
  packageHash: string
  packageJson: PackageJson
  targets: TargetInfo[]
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
