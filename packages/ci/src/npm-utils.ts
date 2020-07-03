import execa from 'execa'
import { ServerInfo } from './types'

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
  const npmRegistryAddress = `${npmRegistry.protocol}://${npmRegistry.host}:${npmRegistry.port}`
  // `npm-login-noninteractive` has a node-api but it prints logs so this is ugly workaround to avoid printing the logs
  await execa.command(
    `${npmLoginPath} -u ${npmRegistryUsername} -p ${npmRegistryToken} -e ${npmRegistryEmail} -r ${npmRegistryAddress}`,
  )
}
