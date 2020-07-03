import { ServerInfo, Protocol } from './types'
import isIp from 'is-ip'

export function toServerInfo({ protocol, host, port }: { protocol?: string; host: string; port?: number }): ServerInfo {
  if (protocol && protocol !== 'http' && protocol !== 'https') {
    throw new Error(
      `protocol is not supported: ${protocol}. params: ${JSON.stringify({ protocol, host, port }, null, 2)}`,
    )
  }
  if (isIp.v6(host)) {
    throw new Error(`ipv6 is not supported: ${host}. params: ${{ protocol, host, port }}`)
  }
  const selectedProtocol: Protocol | undefined = host.includes('://')
    ? (host.split('://')[0] as Protocol)
    : (protocol as Protocol)
  const hostWithoutProtocol = host.replace(`${selectedProtocol}://`, '')
  if (host.includes(':')) {
    const combined = hostWithoutProtocol.split(':')
    return {
      protocol: selectedProtocol,
      host: combined[0],
      port: Number(combined[1]),
    }
  } else {
    return {
      protocol: selectedProtocol,
      host: hostWithoutProtocol,
      port: port || 80,
    }
  }
}
