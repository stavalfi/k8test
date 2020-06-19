/// <reference path="../../../declarations.d.ts" />

import { command, run, subcommands, boolean, flag } from 'cmd-ts'
import { clean } from './clean'
import { deleteK8testResources } from './delete-k8test-resources'
import execa from 'execa'
import { ci } from './ci'
import path from 'path'
import ciInfo from 'ci-info'

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
      },
      handler: args =>
        ci({
          isDryRun: args['dry-run'],
          rootPath: path.join(__dirname, '../../../'),
          isMasterBuild: false,
          runTests: args['run-tests'],
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
