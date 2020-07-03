import execa from 'execa'
import got from 'got'
import Redis from 'ioredis'
import { SingletonStrategy, subscribe, Subscription } from 'k8test'
import { GitServer, starGittServer } from './git-server-testkit'

const isRedisReadyPredicate = (_url: string, host: string, port: number) => {
  const redis = new Redis({
    host,
    port,
    lazyConnect: true, // because i will try to connect manually in the next line
    connectTimeout: 1000,
  })

  return redis.connect().finally(() => {
    try {
      redis.disconnect()
    } catch {
      // ignore error
    }
  })
}

export function prepareTestResources() {
  let dockerRegistry: {
    containerId: string
    port: number
    host: string
  }
  let npmRegistryDeployment: Subscription
  let redisDeployment: Subscription
  let gitServer: GitServer

  // verdaccio allow us to login as any user & password & email
  const verdaccioCardentials = {
    npmRegistryUsername: 'root',
    npmRegistryToken: 'root',
    npmRegistryEmail: 'root@root.root',
  }

  beforeAll(async () => {
    gitServer = await starGittServer()
    const deployments = await Promise.all([
      subscribe({
        imageName: 'verdaccio/verdaccio',
        imagePort: 4873,
        isReadyPredicate: url =>
          got.get(url, {
            timeout: 100,
          }),
        singletonStrategy: SingletonStrategy.oneInNamespace,
        namespaceName: 'k8test-ci',
      }),
      subscribe({
        imageName: 'redis',
        imagePort: 6379,
        singletonStrategy: SingletonStrategy.oneInNamespace,
        isReadyPredicate: isRedisReadyPredicate,
        namespaceName: 'k8test-ci',
      }),
    ])
    npmRegistryDeployment = deployments[0]
    redisDeployment = deployments[1]
    // I can't use k8s for docker-registry so easly: https://stackoverflow.com/questions/62596124/how-to-setup-docker-registry-in-k8s-cluster
    const { stdout: dockerRegistryContainerId } = await execa.command(`docker run -d -p 0:5000 registry:2`)
    const { stdout: dockerRegistryPort } = await execa.command(
      `docker inspect --format="{{(index (index .NetworkSettings.Ports \\"5000/tcp\\") 0).HostPort}}" ${dockerRegistryContainerId}`,
      {
        shell: true,
      },
    )
    dockerRegistry = {
      containerId: dockerRegistryContainerId,
      port: Number(dockerRegistryPort),
      host: 'localhost',
    }
  })
  afterAll(async () => {
    await Promise.all(
      [
        gitServer && gitServer.close(),
        npmRegistryDeployment && npmRegistryDeployment.unsubscribe(),
        dockerRegistry &&
          execa
            .command(`docker kill ${dockerRegistry.containerId}`)
            .then(
              () => execa.command(`docker rm ${dockerRegistry.containerId}`),
              () => Promise.resolve(),
            )
            .catch(() => Promise.resolve()),
      ].filter(Boolean),
    )
  })

  return {
    get: () => ({
      npmRegistry: {
        host: npmRegistryDeployment.deployedImageIp,
        port: npmRegistryDeployment.deployedImagePort,
        protocol: 'http' as 'http',
        auth: verdaccioCardentials,
      },
      dockerRegistry: {
        protocol: 'http' as 'http',
        host: dockerRegistry.host,
        port: dockerRegistry.port,
      },
      redisServer: {
        host: redisDeployment.deployedImageIp,
        port: redisDeployment.deployedImagePort,
      },
      gitServer,
    }),
  }
}
