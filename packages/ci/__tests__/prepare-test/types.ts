import { FolderStructure } from 'create-folder-structure'
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

export type CiOptions = {
  isMasterBuild: boolean
  isDryRun?: boolean
  runTests?: boolean
}

export type PublishedPackageInfo = {
  npm: {
    versions: string[]
    latestVersion: string
  }
  docker: {
    tags: string[]
    latestTag: string
  }
}

export type CiResults = {
  published: Map<string, PublishedPackageInfo>
}

export type RunCi = (options: CiOptions) => Promise<CiResults>

export type CreateRepo = (repo?: Repo) => Promise<RunCi>

export type NewEnvFunc = () => CreateRepo
