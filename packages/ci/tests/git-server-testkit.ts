import { createFolder } from 'create-folder-structure'
import { Server } from 'http'
import { URL } from 'url'
// @ts-ignore
import NodeGitServer from 'node-git-server'

type NodeGitServerInstance = {
  close: () => Promise<void>
  create: (repoName: string, cb: () => void) => void
  listen: (port: number, cb: (err: unknown) => void) => void
  server: Server
}

export type GitServerTestkit = {
  getConnectionType: () => string
  getDomain: () => string
  getAddress: () => string
  generateGitRepositoryAddress: (scope: string, name: string) => string
  reset: () => Promise<void>
  close: () => Promise<void>
  createRepository: (scope: string, name: string) => Promise<void>
}

export function gitServer(): GitServerTestkit {
  let result: NodeGitServerInstance

  const close = async () => {
    await result.close()
  }
  const getPort = () => {
    const result1 = result.server.address()
    if (!result1) {
      throw new Error('could not start git-server. address is null')
    }
    return typeof result1 === 'string' ? new URL(result1).port : 'port' in result1 && result1.port
  }
  const getAddress = () => `http://localhost:${getPort()}`
  const generateGitRepositoryAddress = (scope: string, name: string) => `${getAddress()}/${scope}/${name}.git`
  const reset = async (): Promise<void> => {
    if (result) {
      await close()
    }
    // eslint-disable-next-line require-atomic-updates
    result = new NodeGitServer(await createFolder())
    await new Promise((res, rej) => result.listen(0, err => (err ? rej(err) : res())))
  }
  const createRepository = async (scope: string, name: string): Promise<void> => {
    await new Promise(res => result.create(`${scope}/${name}`, res))
  }
  return {
    getAddress,
    generateGitRepositoryAddress,
    reset,
    close,
    createRepository,
    getConnectionType: () => 'http',
    getDomain: () => `localhost:${getPort()}`,
  }
}
