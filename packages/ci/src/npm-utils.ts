import { ServerInfo } from './types'
import npmLogin from 'npm-login-noninteractive'

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
  const npmRegistryAddress = `${npmRegistry.protocol}://${npmRegistry.host}:${npmRegistry.port}`
  npmLogin(npmRegistryUsername, npmRegistryToken, npmRegistryEmail, npmRegistryAddress)
}
