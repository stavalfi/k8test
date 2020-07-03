/* eslint-disable no-process-env */

import { CiOptions } from '@stavalfi/ci/src/ci-node-api'
import path from 'path'

const redisServer = process.env['REDIS_ENDPOINT'] as string
export const prCiOptions: CiOptions = {
  rootPath: path.join(__dirname, '../../../'),
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
    host: 'registry.npmjs.org',
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
    npmRegistryEmail: process.env['GIT_SERVER_USERNAME'] as string,
    npmRegistryToken: process.env['GIT_SERVER_USERNAME'] as string,
    npmRegistryUsername: process.env['GIT_SERVER_USERNAME'] as string,
    dockerRegistryToken: process.env['GIT_SERVER_USERNAME'] as string,
    dockerRegistryUsername: process.env['GIT_SERVER_USERNAME'] as string,
    redisPassword: process.env['GIT_SERVER_USERNAME'] as string,
  },
}

export const masterCiOptions: CiOptions = {
  ...prCiOptions,
  isMasterBuild: true,
}
