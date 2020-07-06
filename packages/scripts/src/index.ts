#!/usr/bin/env node --unhandled-rejections=strict

/* eslint-disable no-process-env */

/// <reference path="../../../declarations.d.ts" />

import { boolean, command, flag, run, subcommands } from 'cmd-ts'
import execa from 'execa'
import { clean } from './clean'

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
      handler: async () =>
        execa.command(
          `node --unhandled-rejections=strict ${require.resolve('k8test/dist/src/index.js')} delete-k8test-resources`,
          {
            stdio: 'inherit',
          },
        ),
    }),
    'start-k8test-monitoring': command({
      name: 'delete-k8test-resources',
      args: {},
      handler: () =>
        execa.command(
          `node --unhandled-rejections=strict ${require.resolve(
            'k8test/dist/src/index.js',
          )} start-monitoring --local-image`,
          {
            stdio: 'inherit',
          },
        ),
    }),
    'run-ci-pr': command({
      name: 'run-ci-pr',
      args: {},
      handler: () => require('@tahini/nc').runCiCli(require('./get-ci-options').getPrCiOptions(), 'inherit'),
    }),
    'run-ci-master': command({
      name: 'run-ci-master',
      args: {},
      handler: () => require('@tahini/nc').runCiCli(require('./get-ci-options').getMasterCiOptions(), 'inherit'),
    }),
  },
})

run(app, process.argv.slice(2))
