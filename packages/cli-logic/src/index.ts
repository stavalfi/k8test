import { command, run, subcommands, boolean, flag, string, option } from 'cmd-ts'
import { deleteK8testResources, startMonitoring } from './monitoring'
import { defaultK8testNamespaceName } from 'k8s-api'

// eslint-disable-next-line no-console
process.on('unhandledRejection', e => console.error(e))

const namespace = (hasDefaultValue: boolean) =>
  option({
    type: string,
    long: 'namespace',
    defaultValue: () => (hasDefaultValue ? defaultK8testNamespaceName() : ''),
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
        namespace: namespace(true),
      },
      handler: startMonitoring,
    }),
    'delete-k8test-resources': command({
      name: 'delete-k8test-resources',
      args: {
        namespace: namespace(false),
      },
      handler: deleteK8testResources,
    }),
  },
})

run(app, process.argv.slice(2))
