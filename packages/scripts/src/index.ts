/// <reference path="../../../declarations.d.ts" />

import ciInfo from 'ci-info'
import { boolean, command, flag, option, run, string, subcommands } from 'cmd-ts'
import execa from 'execa'
import findProjectRoot from 'find-project-root'
import { ci } from './ci'
import { clean } from './clean'
import { deleteK8testResources } from './delete-k8test-resources'

// eslint-disable-next-line no-console
process.on('unhandledRejection', e => console.error(e))

const app = subcommands({
  name: 'scripts',
  cmds: {
    clean: command({
      name: 'clean',
      args: {
        silent: flag({
          type: boolean,
          long: 'clean',
          defaultValue: () => false,
        }),
      },
      handler: clean,
    }),
    'run-ci': command({
      name: 'ci',
      args: {
        'dry-run': flag({
          type: boolean,
          long: 'dry-run',
          defaultValue: () => false,
        }),
        'master-build': flag({
          type: boolean,
          long: 'master-build',
          defaultValue: () => !ciInfo.isPR,
        }),
        'run-tests': flag({
          type: boolean,
          long: 'run-tests',
          defaultValue: () => true,
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
          env: 'NPM_TOKEN',
        }),
        'docker-registry-username': option({
          type: string,
          long: 'docker-registry-username',
          env: 'DOCKER_HUB_USERNAME',
        }),
        'docker-registry-token': option({
          type: string,
          long: 'docker-registry-token',
          env: 'DOCKER_HUB_TOKEN',
        }),
        'git-server-username': option({
          type: string,
          long: 'git-server-GIT_SERVER_USERNAME',
          env: 'GIT_SERVER_USERNAME',
        }),
        'git-server-token': option({
          type: string,
          long: 'git-server-token',
          env: 'GIT_SERVER_TOKEN',
        }),
        'git-server-domain': option({
          type: string,
          long: 'git-server-domain',
          defaultValue: () => 'github.com',
        }),
        'git-organization': option({
          type: string,
          long: 'git-organization',
        }),
        'git-repository': option({
          type: string,
          long: 'git-repository',
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
          auth: {
            dockerRegistryToken: args['docker-registry-token'],
            dockerRegistryUsername: args['docker-registry-username'],
            gitServerUsername: args['git-server-username'],
            gitServerToken: args['git-server-token'],
            npmRegistryToken: args['npm-registry-token'],
          },
        }),
    }),
    'delete-k8test-resources': command({
      name: 'delete-k8test-resources',
      args: {},
      handler: deleteK8testResources,
    }),
    'start-k8test-monitoring': command({
      name: 'delete-k8test-resources',
      args: {},
      handler: () =>
        execa.command(`node ${require.resolve('k8test-cli-logic/dist/src/index.js')} start-monitoring --local-image`, {
          // eslint-disable-next-line no-process-env
          env: { ...(process.env['DEBUG'] && { DEBUG: process.env['DEBUG'] }) },
          stdio: 'inherit',
        }),
    }),
  },
})

run(app, process.argv.slice(2))
