import { command, run, subcommands, boolean, flag, string, option } from 'cmd-ts'
import { deleteMonitoring, startMonitoring } from './monitoring'

// eslint-disable-next-line no-console
process.on('unhandledRejection', e => console.error(e))

const namespace = option({
  type: string,
  long: 'namespace',
  defaultValue: () => 'k8test',
  description: 'for internal use in k8test tests - in which k8s-namespace k8test will allocate resources',
})

const app = subcommands({
  name: 'k8test-cli',
  cmds: {
    'start-monitoring': command({
      name: 'start-monitoring',
      args: {
        'local-image': flag({
          type: boolean,
          long: 'local-image',
          defaultValue: () => false,
          description:
            'for internal use in k8test tests - before tests, we build a local version of stavalfi/k8test-monitoring image from the source code and it is not exist in docker-registry yet',
        }),
        namespace,
      },
      handler: startMonitoring,
    }),
    'delete-monitoring': command({
      name: 'delete-monitoring',
      args: {
        namespace,
      },
      handler: deleteMonitoring,
    }),
  },
})

run(app, process.argv.slice(2))
