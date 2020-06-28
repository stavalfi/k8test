import execa from 'execa'
import k8testLog from 'k8test-log'
import _ from 'lodash'
import { Graph, PackageInfo, PublishResult, TargetInfo, TargetType, Auth } from './types'
import npmLogin from 'npm-login-noninteractive'

const log = k8testLog('ci:publish')

async function publishNpm({
  isDryRun,
  newVersion,
  npmTarget,
  packageInfo,
  rootPath,
  npmRegistryAddress,
  auth,
}: {
  packageInfo: PackageInfo
  npmTarget: TargetInfo<TargetType.npm>
  newVersion: string
  isDryRun: boolean
  rootPath: string
  npmRegistryAddress: string
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

  await execa.command(`npm publish --registry ${npmRegistryAddress}`, { stdio: 'pipe', cwd: packageInfo.packagePath })
  await execa.command(
    `npm dist-tag add ${packageInfo.packageJson.name}@${newVersion} latest-hash--${packageInfo.packageHash} --registry ${npmRegistryAddress}`,
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
  dockerRegistryAddress,
  dockerOrganizationName,
}: {
  packageInfo: PackageInfo
  dockerTarget: TargetInfo<TargetType.docker>
  newVersion: string
  isDryRun: boolean
  rootPath: string
  dockerRegistryAddress: string
  dockerOrganizationName: string
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

  const dockerImageWithRepo = `${dockerRegistryAddress}/${dockerOrganizationName}/${packageInfo.packageJson.name}`

  log('building docker image "%s" in package: "%s"', dockerImageWithRepo, packageInfo.packageJson.name)

  await execa.command(
    `docker build --label latest-hash=${packageInfo.packageHash} --label latest-tag=${newVersion} -f Dockerfile -t ${dockerImageWithRepo}:latest ${rootPath}`,
    {
      cwd: packageInfo.packagePath,
      stdio: 'inherit',
    },
  )
  log('built docker image "%s" in package: "%s"', dockerImageWithRepo, packageInfo.packageJson.name)

  log(
    'creating tags: "%s" and "%s" to docker image "%s" in package: "%s"',
    newVersion,
    dockerImageWithRepo,
    packageInfo.packageHash,
    packageInfo.packageJson.name,
  )
  await execa.command(`docker tag ${dockerImageWithRepo}:latest ${dockerImageWithRepo}:${newVersion}`, {
    stdio: 'inherit',
  })

  if (isDryRun) {
    return { published: false, packagePath: packageInfo.packagePath }
  }

  await execa.command(`docker push ${dockerImageWithRepo}:latest`, { stdio: 'inherit' })
  await execa.command(`docker push ${dockerImageWithRepo}:${newVersion}`, { stdio: 'inherit' })

  log('published docker target in package: "%s"', packageInfo.packageJson.name)

  return { published: true, newVersion: newVersion, packagePath: packageInfo.packagePath }
}

export async function publish(
  orderedGraph: Graph<PackageInfo>,
  options: {
    rootPath: string
    isDryRun: boolean
    npmRegistryAddress: string
    dockerRegistryAddress: string
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
        npmLogin(
          options.auth.npmRegistryUsername,
          options.auth.npmRegistryToken,
          options.auth.npmRegistryEmail,
          options.npmRegistryAddress,
        )
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
          npmRegistryAddress: options.npmRegistryAddress,
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
          dockerRegistryAddress: options.dockerRegistryAddress,
          dockerOrganizationName: options.dockerOrganizationName,
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

    return { npmResult, dockerResult }
  }
}
