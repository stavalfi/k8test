#!/usr/bin/env node --unhandled-rejections=strict

/// <reference path="../../../declarations.d.ts" />

import { boolean, command, flag, option, optional, run, string } from 'cmd-ts'
import findProjectRoot from 'find-project-root'
import { ci } from './ci-logic'
import { toServerInfo } from './utils'
import parseGitUrl from 'git-url-parse'

export { CiOptions, runCiCli } from './ci-node-api'

async function main() {
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
      'skip-tests': flag({
        type: boolean,
        long: 'skip-tests',
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
        defaultValue: () => 'https://registry.npmjs.com',
        description: 'npm registry address to publish npm-targets to',
      }),
      'npm-registry-username': option({
        type: string,
        long: 'npm-registry-username',
      }),
      'npm-registry-token': option({
        type: string,
        long: 'npm-registry-token',
      }),
      'npm-registry-email': option({
        type: string,
        long: 'npm-registry-email',
      }),
      'redis-server': option({
        type: string,
        long: 'redis-server',
        description: 'ip:port',
      }),
      'redis-password': option({
        type: optional(string),
        long: 'redis-password',
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
      'git-repo': option({
        type: string,
        long: 'git-repo',
        description:
          'example: https://github.com/stavalfi/k8test, http://localhost:8081/a/b (ssh-url is not supported)',
      }),
      'docker-repository': option({
        type: string,
        long: 'docker-repository',
      }),
      'docker-registry': option({
        type: string,
        long: 'docker-registry',
        defaultValue: () => 'https://registry.hub.docker.com',
        description:
          'docker registry address to publish docker-targets to: https://registry.hub.docker.com, http://localhost:5000',
      }),
    },
    handler: async args => {
      const dockerRegistry = toServerInfo({
        host: args['docker-registry'],
      })
      const { protocols, source, port, name, organization } = parseGitUrl(args['git-repo'])
      if (port === null) {
        throw new Error(`can't fidn the port in the git-repo parameter: ${args['git-repo']}`)
      }
      const gitServer = toServerInfo({
        protocol: protocols[0],
        host: source,
        port,
      })
      const npmRegistry = toServerInfo({
        host: args['npm-registry'],
      })
      const redisServer = toServerInfo({
        host: args['redis-server'],
      })
      await ci({
        isDryRun: args['dry-run'],
        rootPath: args.cwd,
        isMasterBuild: args['master-build'],
        skipTests: args['skip-tests'],
        gitRepositoryName: name,
        gitOrganizationName: organization,
        dockerOrganizationName: args['docker-repository'],
        dockerRegistry,
        gitServer,
        npmRegistry,
        redisServer,
        auth: {
          dockerRegistryToken: args['docker-registry-token'],
          dockerRegistryUsername: args['docker-registry-username'],
          gitServerUsername: args['git-server-username'],
          gitServerToken: args['git-server-token'],
          npmRegistryUsername: args['npm-registry-username'],
          npmRegistryEmail: args['npm-registry-email'],
          npmRegistryToken: args['npm-registry-token'],
          redisPassword: args['redis-password'],
        },
      })
    },
  })

  await run(app, process.argv.slice(2))
}

if (require.main === module) {
  // eslint-disable-next-line no-floating-promise/no-floating-promise
  main()
}
