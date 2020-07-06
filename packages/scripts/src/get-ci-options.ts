/* eslint-disable no-process-env */

import { CiOptions } from '@tahini/nc'
import path from 'path'

export const getPrCiOptions = (): CiOptions => {
  const redisServer = process.env['REDIS_ENDPOINT']?.split(':') as string[]
  return {
    rootPath: path.join(require.resolve('scripts'), '../../../../../'),
    dockerOrganizationName: 'stavalfi',
    dockerRegistry: {
      host: 'registry.hub.docker.com',
      port: 443,
      protocol: 'https',
    },
    gitOrganizationName: 'stavalfi',
    gitRepositoryName: 'k8test',
    gitServer: {
      host: 'github.com',
      port: 443,
      protocol: 'https',
    },
    npmRegistry: {
      host: 'registry.npmjs.com',
      port: 443,
      protocol: 'https',
    },
    redisServer: {
      host: redisServer[0],
      port: Number(redisServer[1]),
    },
    isDryRun: false,
    isMasterBuild: false,
    skipTests: false,
    auth: {
      gitServerToken: process.env['GIT_SERVER_TOKEN'] as string,
      gitServerUsername: process.env['GIT_SERVER_USERNAME'] as string,
      npmRegistryEmail: 'stavalfi@gmail.com',
      npmRegistryToken: process.env['NPM_TOKEN'] as string,
      npmRegistryUsername: process.env['NPM_USERNAME'] as string,
      dockerRegistryToken: process.env['DOCKER_HUB_TOKEN'] as string,
      dockerRegistryUsername: process.env['DOCKER_HUB_USERNAME'] as string,
      redisPassword: process.env['REDIS_PASSWORD'] as string,
    },
  }
}
export const getMasterCiOptions = (): CiOptions => ({
  ...getPrCiOptions(),
  skipTests: true,
  isMasterBuild: true,
})
