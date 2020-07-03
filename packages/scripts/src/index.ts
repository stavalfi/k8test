#!/usr/bin/env node --unhandled-rejections=strict

/* eslint-disable no-process-env */

/// <reference path="../../../declarations.d.ts" />

import { runCiCli } from '@stavalfi/ci/src/ci-node-api'
import { boolean, command, flag, run, subcommands } from 'cmd-ts'
import execa from 'execa'
import { clean } from './clean'
import { deleteK8testResources } from './delete-k8test-resources'
import { prCiOptions, masterCiOptions } from './get-ci-options'

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
    'run-ci-pr': command({
      name: 'run-ci-pr',
      args: {},
      handler: () => runCiCli(prCiOptions, 'inherit'),
    }),
    'run-ci-master': command({
      name: 'run-ci-master',
      args: {},
      handler: () => runCiCli(masterCiOptions, 'inherit'),
    }),
  },
})

run(app, process.argv.slice(2))
