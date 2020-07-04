import execa from 'execa'
import { ServerInfo } from './types'
import isIp from 'is-ip'

export async function npmRegistryLogin({
  npmRegistry,
  npmRegistryEmail,
  npmRegistryToken,
  npmRegistryUsername,
}: {
  npmRegistry: ServerInfo
  npmRegistryUsername: string
  npmRegistryToken: string
  npmRegistryEmail: string
}): Promise<void> {
  const npmLoginPath = require.resolve('.bin/npm-login-noninteractive')
  const withPort = isIp.v4(npmRegistry.host) || npmRegistry.host === 'localhost' ? `:${npmRegistry.port}` : ''
  const npmRegistryAddress = `${npmRegistry.protocol}://${npmRegistry.host}${withPort}`
  // `npm-login-noninteractive` has a node-api but it prints logs so this is ugly workaround to avoid printing the logs
  await execa.command(
    `${npmLoginPath} -u ${npmRegistryUsername} -p ${npmRegistryToken} -e ${npmRegistryEmail} -r ${npmRegistryAddress}`,
  )
}
