#!/usr/bin/env node --unhandled-rejections=strict

/// <reference path="../../../declarations.d.ts" />

import { boolean, command, flag, run, subcommands } from 'cmd-ts'
import execa from 'execa'
import { clean } from './clean'
import { deleteK8testResources } from './delete-k8test-resources'

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
