import { createFolder } from 'create-folder-structure'
import { Server } from 'http'
import { URL } from 'url'
import NodeGitServer from 'node-git-server'

type NodeGitServerInstance = {
  close: () => Promise<void>
  create: (repoName: string, cb: () => void) => void
  listen: (port: number, cb: (err: unknown) => void) => void
  server: Server
}

export type GitServer = {
  getUsername: () => string
  getToken: () => string
  getAddress: () => string
  generateGitRepositoryAddress: (scope: string, name: string) => string
  close: () => Promise<void>
  createRepository: (scope: string, name: string) => Promise<void>
  getConnectionType: () => string
  getDomain: () => string
}

const getPort = (server: Server) => {
  const result1 = server.address()
  if (!result1) {
    throw new Error('could not start git-server. address is null')
  }
  return typeof result1 === 'string' ? new URL(result1).port : 'port' in result1 && result1.port
}

export const starGittServer = async (): Promise<GitServer> => {
  const username = 'root'
  const token = 'root'

  const server: NodeGitServerInstance = new NodeGitServer(await createFolder(), {
    authenticate: ({ type, user }, next) => {
      if (type == 'push') {
        user((user, userToken) => {
          if (user !== username) {
            throw new Error(`username is incorrect: it is "${user}" instead of "${username}"`)
          }
          if (token !== userToken) {
            throw new Error(`token is incorrect: it is "${userToken}" instead of "${token}"`)
          }
          next()
        })
      } else {
        next()
      }
    },
  })

  await new Promise((res, rej) => server.listen(0, err => (err ? rej(err) : res())))

  const port = getPort(server.server)
  const connectionType = 'http'
  const ip = 'localhost'
  const address = `${connectionType}://${ip}:${port}`

  return {
    getUsername: () => username,
    getToken: () => token,
    getAddress: () => address,
    generateGitRepositoryAddress: (scope, name) => `${address}/${scope}/${name}.git`,
    close: () => server.close(),
    createRepository: async (scope, name) => {
      await new Promise(res => server.create(`${scope}/${name}`, res))
    },
    getConnectionType: () => connectionType,
    getDomain: () => `${ip}:${port}`,
  }
}
