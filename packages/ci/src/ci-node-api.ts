import execa, { StdioOption } from 'execa'
import { CiOptions } from './types'

export { CiOptions }

export const runCiCli = async (
  options: CiOptions,
  stdio: 'pipe' | 'ignore' | 'inherit' | readonly StdioOption[],
): Promise<execa.ExecaChildProcess> => {
  const ciCliPath = require.resolve('@stavalfi/ci/dist/src/index.js')

  const command = `\
  node --unhandled-rejections=strict ${ciCliPath}\
    --cwd ${options.rootPath} \
    --master-build=${options.isMasterBuild} \
    --dry-run=${options.isDryRun} \
    --skip-tests=${options.skipTests} \
    --docker-registry ${options.dockerRegistry.protocol}://${options.dockerRegistry.host}:${
    options.dockerRegistry.port
  } \
    --npm-registry ${options.npmRegistry.protocol}://${options.npmRegistry.host}:${options.npmRegistry.port} \
    --git-repo ${options.gitServer.protocol}://${options.gitServer.host}:${options.gitServer.port}/${
    options.gitOrganizationName
  }/${options.gitRepositoryName} \
    --docker-repository ${options.dockerOrganizationName} \
    ${options.auth.dockerRegistryToken ? `--docker-registry-token ${options.auth.dockerRegistryToken}` : ''} \
    ${options.auth.dockerRegistryUsername ? `--docker-registry-username ${options.auth.dockerRegistryUsername}` : ''} \
    --git-server-token ${options.auth.gitServerToken} \
    --git-server-username ${options.auth.gitServerUsername} \
    --npm-registry-username ${options.auth.npmRegistryUsername} \
    --npm-registry-email ${options.auth.npmRegistryEmail} \
    --npm-registry-token ${options.auth.npmRegistryToken} \
    ${options.auth.redisPassword ? `--redis-password ${options.auth.redisPassword}` : ''} \
    --redis-server ${options.redisServer.host}:${options.redisServer.port}
  `

  return execa.command(command, {
    stdio: stdio,
  })
}
