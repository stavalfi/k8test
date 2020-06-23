import { TargetType } from '../../src/ci'

export enum Resource {
  dockerRegistry = 'docker-registry',
  npmRegistry = 'npm-registry',
  gitServer = 'git-server',
}

export type Package = {
  name: string
  targetType: TargetType
}

export type NewEnvOptions = {
  testResources: Resource[]
}
