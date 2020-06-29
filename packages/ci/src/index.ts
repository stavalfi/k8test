#!/usr/bin/env node

/// <reference path="../../../declarations.d.ts" />

import { boolean, command, flag, option, optional, run, string } from 'cmd-ts'
import findProjectRoot from 'find-project-root'
import { ci } from './ci-logic'

// eslint-disable-next-line no-console
process.on('unhandledRejection', e => console.error(e))

const app = command({
  name: 'scripts',
  args: {
    'dry-run': flag({
      type: boolean,
      long: 'dry-run',
      defaultValue: () => false,
    }),
    'master-build': flag({
      type: boolean,
      long: 'master-build',
    }),
    'skip-tests': flag({
      type: boolean,
      long: 'skip-tests',
      defaultValue: () => false,
    }),
    cwd: option({
      type: string,
      long: 'cwd',
      defaultValue: () => findProjectRoot(__dirname) as string,
      description: 'from where to run the ci',
    }),
    'npm-registry': option({
      type: string,
      long: 'npm-registry',
      defaultValue: () => 'https://registry.npmjs.org',
      description: 'npm registry address to publish npm-targets to',
    }),
    'npm-registry-username': option({
      type: string,
      long: 'npm-registry-username',
    }),
    'npm-registry-token': option({
      type: string,
      long: 'npm-registry-token',
    }),
    'npm-registry-email': option({
      type: string,
      long: 'npm-registry-email',
    }),
    'redis-endpoint': option({
      type: string,
      long: 'redis-endpoint',
      description: 'ip:port',
    }),
    'redis-password': option({
      type: optional(string),
      long: 'redis-password',
    }),
    'docker-registry-username': option({
      type: optional(string),
      long: 'docker-registry-username',
    }),
    'docker-registry-token': option({
      type: optional(string),
      long: 'docker-registry-token',
    }),
    'git-server-username': option({
      type: string,
      long: 'git-server-username',
    }),
    'git-server-token': option({
      type: string,
      long: 'git-server-token',
    }),
    'git-server-domain': option({
      type: string,
      long: 'git-server-domain',
    }),
    'git-organization': option({
      type: string,
      long: 'git-organization',
    }),
    'git-repository': option({
      type: string,
      long: 'git-repository',
    }),
    'git-server-protocol': option({
      type: string,
      long: 'git-server-protocol',
      description: 'http or htts',
    }),
    'docker-repository': option({
      type: string,
      long: 'docker-repository',
    }),
    'docker-registry': option({
      type: string,
      long: 'docker-registry',
      defaultValue: () => 'registry.hub.docker.com',
      description: 'docker registry address to publish docker-targets to',
    }),
    'docker-registry-protocol': option({
      type: string,
      long: 'docker-registry-protocol',
      description: 'http or htts',
    }),
  },
  handler: async args => {
    const [redisIp, redisPort] = args['redis-endpoint'].split(':')
    try {
      await ci({
        isDryRun: args['dry-run'],
        rootPath: args.cwd,
        isMasterBuild: args['master-build'],
        skipTests: args['skip-tests'],
        gitRepositoryName: args['git-repository'],
        gitOrganizationName: args['git-organization'],
        gitServerDomain: args['git-server-domain'],
        npmRegistryAddress: args['npm-registry'],
        dockerRegistryAddress: args['docker-registry'],
        dockerOrganizationName: args['docker-repository'],
        gitServerProtocol: args['git-server-protocol'],
        dockerRegistryProtocol: args['docker-registry-protocol'],
        redisIp,
        redisPort: Number(redisPort),
        auth: {
          dockerRegistryToken: args['docker-registry-token'],
          dockerRegistryUsername: args['docker-registry-username'],
          gitServerUsername: args['git-server-username'],
          gitServerToken: args['git-server-token'],
          npmRegistryUsername: args['npm-registry-username'],
          npmRegistryEmail: args['npm-registry-email'],
          npmRegistryToken: args['npm-registry-token'],
          redisPassword: args['redis-password'],
        },
      })
    } catch (e) {
      process.exitCode = 1
      throw e
    }
  },
})

run(app, process.argv.slice(2))
