import { ServerInfo, Protocol } from './types'
import isIp from 'is-ip'

export function toServerInfo({ protocol, host, port }: { protocol?: string; host: string; port?: number }): ServerInfo {
  const paramsToString = JSON.stringify({ protocol, host, port }, null, 2)
  if (protocol && protocol !== 'http' && protocol !== 'https') {
    throw new Error(`protocol is not supported: ${protocol}. params: ${paramsToString}`)
  }
  if (isIp.v6(host)) {
    throw new Error(`ipv6 is not supported: ${host}. params: ${paramsToString}`)
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
    const selectedPort = port || (selectedProtocol === 'http' ? 80 : selectedProtocol === 'https' ? 443 : undefined)
    if (selectedPort === undefined) {
      throw new Error(`cant find the port in: ${paramsToString}`)
    }
    return {
      protocol: selectedProtocol,
      host: hostWithoutProtocol,
      port: selectedPort,
    }
  }
}
