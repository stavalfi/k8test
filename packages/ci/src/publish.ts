import execa from 'execa'
import k8testLog from 'k8test-log'
import _ from 'lodash'
import { buildFullDockerImageName } from './docker-utils'
import { npmRegistryLogin } from './npm-utils'
import { Auth, Graph, PackageInfo, PublishResult, ServerInfo, TargetInfo, TargetType } from './types'
import isIp from 'is-ip'

const log = k8testLog('ci:publish')

async function publishNpm({
  isDryRun,
  newVersion,
  npmTarget,
  packageInfo,
  rootPath,
  npmRegistry,
  auth,
}: {
  packageInfo: PackageInfo
  npmTarget: TargetInfo<TargetType.npm>
  newVersion: string
  isDryRun: boolean
  rootPath: string
  npmRegistry: ServerInfo
  auth: Auth
}): Promise<PublishResult> {
  log('publishing npm target in package: "%s"', packageInfo.packageJson.name)

  if (!npmTarget.needPublish) {
    // it looks like someone manually published the promoted version before the ci publish it. all in all, the res
    log(
      'npm target in package: "%s" is already published with the correct hash and version',
      packageInfo.packageJson.name,
    )
    return {
      published: true,
      newVersion,
      packagePath: packageInfo.packagePath,
    }
  }

  if (isDryRun) {
    return { published: false, packagePath: packageInfo.packagePath }
  }

  const withPort = isIp.v4(npmRegistry.host) || npmRegistry.host === 'localhost' ? `:${npmRegistry.port}` : ''
  const npmRegistryAddress = `${npmRegistry.protocol}://${npmRegistry.host}${withPort}`

  if (!packageInfo.packageJson.name) {
    throw new Error(`package.json of: ${packageInfo.packagePath} must have a name property.`)
  }

  await execa.command(
    `yarn publish --registry ${npmRegistryAddress} --non-interactive ${
      packageInfo.packageJson.name.includes('@') ? '--access public' : ''
    }`,
    {
      cwd: packageInfo.packagePath,
      env: {
        // npm need this env-var for auth - this is needed only for production publishing.
        // in tests it doesn't do anything and we login manually to npm in tests.
        NPM_AUTH_TOKEN: auth.npmRegistryToken,
      },
    },
  )

  await execa.command(
    `npm dist-tag add ${packageInfo.packageJson.name}@${npmTarget.newVersion} latest-hash--${packageInfo.packageHash} --registry ${npmRegistryAddress}`,
  )

  log('published npm target in package: "%s"', packageInfo.packageJson.name)

  return { published: true, newVersion, packagePath: packageInfo.packagePath }
}

async function publishDocker({
  rootPath,
  isDryRun,
  newVersion,
  dockerTarget,
  packageInfo,
  dockerOrganizationName,
  dockerRegistry,
}: {
  packageInfo: PackageInfo
  dockerTarget: TargetInfo<TargetType.docker>
  dockerRegistry: ServerInfo
  dockerOrganizationName: string
  newVersion: string
  isDryRun: boolean
  rootPath: string
}): Promise<PublishResult> {
  log('publishing docker target in package: "%s"', packageInfo.packageJson.name)

  if (!dockerTarget.needPublish) {
    // it looks like someone manually published the promoted version before the ci publish it. all in all, the res
    log(
      'npm target in package: "%s" is already published with the correct hash and version',
      packageInfo.packageJson.name,
    )
    return {
      published: true,
      newVersion: dockerTarget.latestPublishedVersion.version,
      packagePath: packageInfo.packagePath,
    }
  }

  if (!packageInfo.packageJson.name) {
    throw new Error(`package.json of: ${packageInfo.packagePath} must have a name property.`)
  }

  const fullImageNameLatest = buildFullDockerImageName({
    dockerOrganizationName,
    dockerRegistry,
    packageJsonName: packageInfo.packageJson.name,
    imageTag: 'latest',
  })

  const fullImageNameNewVersion = buildFullDockerImageName({
    dockerOrganizationName,
    dockerRegistry,
    packageJsonName: packageInfo.packageJson.name,
    imageTag: dockerTarget.newVersion,
  })

  log('building docker image "%s" in package: "%s"', fullImageNameNewVersion, packageInfo.packageJson.name)

  await execa.command(
    `docker build --label latest-hash=${packageInfo.packageHash} --label latest-tag=${newVersion} -f Dockerfile -t ${fullImageNameLatest} ${rootPath}`,
    {
      cwd: packageInfo.packagePath,
      stdio: 'inherit',
    },
  )
  log('built docker image "%s" in package: "%s"', fullImageNameNewVersion, packageInfo.packageJson.name)

  log(
    'creating tags: ["%s", "%s"] to docker image "%s" in package: "%s"',
    newVersion,
    packageInfo.packageHash,
    fullImageNameNewVersion,
    packageInfo.packageJson.name,
  )
  await execa.command(`docker tag ${fullImageNameLatest} ${fullImageNameNewVersion}`, {})

  if (isDryRun) {
    return { published: false, packagePath: packageInfo.packagePath }
  }

  await execa.command(`docker push ${fullImageNameNewVersion}`)
  await execa.command(`docker push ${fullImageNameLatest}`)

  log('published docker target in package: "%s"', packageInfo.packageJson.name)

  return { published: true, newVersion: newVersion, packagePath: packageInfo.packagePath }
}

export async function publish(
  orderedGraph: Graph<PackageInfo>,
  options: {
    rootPath: string
    isDryRun: boolean
    npmRegistry: ServerInfo
    dockerRegistry: ServerInfo
    dockerOrganizationName: string
    auth: Auth
  },
) {
  log('start publishing packages...')
  const toPublish = orderedGraph.map(node => node.data).filter(data => data.target?.needPublish)

  // todo: optimize it even more - we can run all in parallel but we must make sure that every docker has all it's npm dep already published
  const npm = toPublish.filter(data => data.target?.targetType === TargetType.npm)
  const docker = toPublish.filter(data => data.target?.targetType === TargetType.docker)

  if (toPublish.length === 0) {
    log(`there is no need to publish anything. all packages that should publish, didn't change.`)
  } else {
    log('publishing the following packages: %s', toPublish.map(node => `"${node.packageJson.name}"`).join(', '))
    if (!options.isDryRun) {
      if (npm.length > 0) {
        await npmRegistryLogin({
          npmRegistry: options.npmRegistry,
          npmRegistryUsername: options.auth.npmRegistryUsername,
          npmRegistryToken: options.auth.npmRegistryToken,
          npmRegistryEmail: options.auth.npmRegistryEmail,
        })
      }
    }

    const npmResult = await Promise.all(
      npm.map(node =>
        publishNpm({
          packageInfo: node,
          npmTarget: node.target as TargetInfo<TargetType.npm>,
          newVersion: (node.target?.needPublish && node.target.newVersion) as string,
          isDryRun: options.isDryRun,
          rootPath: options.rootPath,
          npmRegistry: options.npmRegistry,
          auth: options.auth,
        }),
      ),
    )
    log(
      `npm publish results: %O`,
      JSON.stringify(
        npmResult.map(node => _.omit(node, ['packageInfo.packageJson'])),
        null,
        2,
      ),
    )

    const dockerResult = await Promise.all(
      docker.map(node =>
        publishDocker({
          packageInfo: node,
          dockerTarget: node.target as TargetInfo<TargetType.docker>,
          newVersion: (node.target?.needPublish && node.target.newVersion) as string,
          rootPath: options.rootPath,
          isDryRun: options.isDryRun,
          dockerOrganizationName: options.dockerOrganizationName,
          dockerRegistry: options.dockerRegistry,
        }),
      ),
    )

    log(
      `docker publish results: %O`,
      JSON.stringify(
        dockerResult.map(node => _.omit(node, ['packageInfo.packageJson'])),
        null,
        2,
      ),
    )

    return { dockerResult }
  }
}
