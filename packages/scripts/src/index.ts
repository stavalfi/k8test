import { command, run, subcommands, boolean, flag } from 'cmd-ts'
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
          long: 'silent',
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
  },
})

run(app, process.argv.slice(2))
