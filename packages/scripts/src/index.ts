#!/usr/bin/env YARN_SILENT=1 yarn ts-node

import { command, run, subcommands, boolean, flag } from 'cmd-ts'
import { clean } from './clean'

const app = subcommands({
  name: 'scripts',
  cmds: {
    clean: command({
      name: 'clean',
      args: {
        silent: flag({
          type: boolean,
          long: 'silent',
          defaultValue: () => false,
        }),
      },
      handler: clean,
    }),
  },
})

run(app, process.argv.slice(2))
