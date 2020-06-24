import { FolderStructure } from 'create-folder-structure'
import { Subscription } from 'k8test'
import { IDependencyMap } from 'package-json-type'

export enum TargetType {
  docker = 'docker',
  npm = 'npm',
  none = 'private-npm',
}

export enum Resource {
  dockerRegistry = 'docker-registry',
  npmRegistry = 'npm-registry',
  gitServer = 'git-server',
}

export type Package = {
  name: string
  version: string
  targetType: TargetType
  dependencies?: IDependencyMap
  devDependencies?: IDependencyMap
  src?: FolderStructure
  tests?: FolderStructure
  additionalFiles?: FolderStructure
}

export type Repo = {
  packages?: Package[]
  rootFiles?: FolderStructure
}

export type NewEnvOptions = {
  testResources: Resource[]
}

export type CiOptions = {
  isMasterBuild: boolean
  isDryRun?: boolean
  runTests?: boolean
  dockerRegistryDeployment: Subscription
  npmRegistryDeployment: Subscription
  gitServerDomain: string
  repo: Repo
}

type PublishedVersion = string

export type CiResults = {
  published: { [packageName: string]: PublishedVersion }
}

export type RunCi = (options: CiOptions) => Promise<CiResults>

export type NewEnvFunc = (options: NewEnvOptions) => Promise<RunCi>
