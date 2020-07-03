import { FolderStructure } from 'create-folder-structure'
import { IDependencyMap, IPackageJson } from 'package-json-type'
import execa, { StdioOption } from 'execa'
import { ServerInfo } from 'ci/src/types'

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
  stdio?: 'pipe' | 'ignore' | 'inherit' | readonly StdioOption[]
}

export type PublishedPackageInfo = {
  npm: {
    versions: string[]
    latestVersion?: string
  }
  docker: {
    tags: string[]
    latestTag?: string
  }
}

export type TestResources = {
  npmRegistry: ServerInfo
  dockerRegistry: ServerInfo
  gitServer: ServerInfo
  redisServer: ServerInfo
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
  toActualName: ToActualName
  dockerOrganizationName: string
  getPackagePath: (packageName: string) => Promise<string>
  addRandomFileToPackage: AddRandomFileToPackage
  addRandomFileToRoot: AddRandomFileToRoot
  installAndRunNpmDependency: (dependencyName: string) => Promise<execa.ExecaChildProcess<string>>
  publishDockerPackageWithoutCi: (
    packageName: string,
    imageTag: string,
    labels?: { 'latest-hash'?: string; 'latest-tag'?: string },
  ) => Promise<void>
  publishNpmPackageWithoutCi: (packageName: string) => Promise<void>
  unpublishNpmPackage: (packageName: string, versionToUnpublish: string) => Promise<void>
  removeAllNpmHashTags: (packageName: string) => Promise<void>
  modifyPackageJson: (
    packageName: string,
    modification: (packageJson: IPackageJson) => Promise<IPackageJson>,
  ) => Promise<void>
  runCi: RunCi
}>

export type NewEnvFunc = () => {
  createRepo: CreateAndManageRepo
  getTestResources: () => TestResources
}
