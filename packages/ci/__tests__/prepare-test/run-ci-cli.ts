import execa, { StdioOption } from 'execa'
import path from 'path'
import { CiOptions } from '../../src/types'

const ciCliPath = path.join(__dirname, '../../dist/src/index.js')

export const runCiCli = async (
  options: CiOptions,
  stdio?: 'pipe' | 'ignore' | 'inherit' | readonly StdioOption[],
): Promise<execa.ExecaChildProcess> => {
  const command = `\
  ${ciCliPath}\
    --cwd ${options.rootPath} \
    --master-build=${options.isMasterBuild} \
    --dry-run=${options.isDryRun} \
    --skip-tests=${options.skipTests} \
    --docker-registry ${options.dockerRegistry.host}:${options.dockerRegistry.port} \
    --npm-registry ${options.npmRegistry.protocol}://${options.npmRegistry.host}:${options.npmRegistry.port} \
    --git-server-domain ${options.gitServer.host}:${options.gitServer.port} \
    --docker-repository ${options.dockerOrganizationName} \
    --git-organization ${options.gitOrganizationName} \
    --git-repository ${options.gitRepositoryName} \
    ${options.auth.dockerRegistryToken ? `--docker-registry-token ${options.auth.dockerRegistryToken}` : ''} \
    ${options.auth.dockerRegistryUsername ? `--docker-registry-username ${options.auth.dockerRegistryUsername}` : ''} \
    --git-server-token ${options.auth.gitServerToken} \
    --git-server-username ${options.auth.gitServerUsername} \
    --npm-registry-username ${options.auth.npmRegistryUsername} \
    --npm-registry-email ${options.auth.npmRegistryEmail} \
    --npm-registry-token ${options.auth.npmRegistryToken} \
    --git-server-protocol ${options.gitServer.protocol} \
    --docker-registry-protocol ${options.dockerRegistry.protocol} \
    ${options.auth.redisPassword ? `--redis-password ${options.auth.redisPassword}` : ''} \
    --redis-endpoint ${options.redisServer.host}:${options.redisServer.port}
  `

  return execa.command(command, {
    stdio: stdio || 'inherit',
  })
}
