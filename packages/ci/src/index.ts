#!/usr/bin/env node

/// <reference path="../../../declarations.d.ts" />

import { boolean, command, flag, option, run, string, optional } from 'cmd-ts'
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
    'run-tests': flag({
      type: boolean,
      long: 'run-tests',
      defaultValue: () => true,
    }),
    'skip-docker-registry-login': flag({
      type: boolean,
      long: 'skip-docker-registry-login',
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
      defaultValue: () => 'registry.npmjs.org',
      description: 'npm registry address to publish npm-targets to',
    }),
    'npm-registry-token': option({
      type: string,
      long: 'npm-registry-token',
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
    'git-server-connection-type': option({
      type: string,
      long: 'git-server-connection-type',
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
  },
  handler: args =>
    ci({
      isDryRun: args['dry-run'],
      rootPath: args.cwd,
      isMasterBuild: args['master-build'],
      runTests: args['run-tests'],
      gitRepositoryName: args['git-repository'],
      gitOrganizationName: args['git-organization'],
      gitServerDomain: args['git-server-domain'],
      npmRegistryAddress: args['npm-registry'],
      dockerRegistryAddress: args['docker-registry'],
      dockerRepositoryName: args['docker-repository'],
      gitServerConnectionType: args['git-server-connection-type'],
      auth: {
        dockerRegistryToken: args['docker-registry-token'],
        dockerRegistryUsername: args['docker-registry-username'],
        gitServerUsername: args['git-server-username'],
        gitServerToken: args['git-server-token'],
        npmRegistryToken: args['npm-registry-token'],
        skipDockerRegistryLogin: args['skip-docker-registry-login'],
      },
    }),
})

run(app, process.argv.slice(2))
