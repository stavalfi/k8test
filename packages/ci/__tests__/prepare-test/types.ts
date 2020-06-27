import { FolderStructure } from 'create-folder-structure'
import { IDependencyMap } from 'package-json-type'
import execa from 'execa'

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

export type NpmRegistry = {
  port: number
  ip: string
}

export type Package = {
  name: string
  version: string
  targetType: TargetType
  'index.js'?: string
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
  skipTests?: boolean
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

export type ToActualName = (name: string) => string

export type RunCi = (options: CiOptions) => Promise<CiResults>
export type AddRandomFileToPackage = (packageName: string) => Promise<string>
export type AddRandomFileToRoot = () => Promise<string>

export type CreateAndManageRepo = (
  repo?: Repo,
) => Promise<{
  repoPath: string
  getPackagePath: (packageName: string) => Promise<string>
  runCi: RunCi
  addRandomFileToPackage: AddRandomFileToPackage
  addRandomFileToRoot: AddRandomFileToRoot
  installAndRunNpmDependency: (dependencyName: string) => Promise<execa.ExecaChildProcess<string>>
}>

export type NewEnvFunc = () => {
  createRepo: CreateAndManageRepo
}
