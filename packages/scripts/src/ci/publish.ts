import execa from 'execa'
import k8testLog from 'k8test-log'
import _ from 'lodash'
import { DockerTargetInfo, Graph, NpmTargetInfo, PackageInfo, PublishResult, TargetType } from './types'
import { shouldPublish } from './utils'

const log = k8testLog('scripts:ci:publish')

async function publishNpm(
  packageInfo: Omit<PackageInfo, 'targets'>,
  target: NpmTargetInfo,
  options: { isDryRun: boolean },
): Promise<PublishResult> {
  log('publishing npm target in package: "%s"', packageInfo.packageJson.name)

  const npmLatestVersion = target.npm.latestVersion?.version

  if (npmLatestVersion === packageInfo.packageJson.version) {
    // it looks like someone manually published the promoted version before the ci publish it. all in all, the result in valid.
    return { published: true, newVersion: packageInfo.packageJson.version, packagePath: packageInfo.packagePath }
  }

  const newVersion = packageInfo.packageJson.version

  if (options.isDryRun) {
    return { published: false, packagePath: packageInfo.packagePath }
  }

  // we are assuming that process.env.NPM_TOKEN is set by secrethub
  await execa.command(`npm publish ${packageInfo.packagePath}`, { stdio: 'inherit' })
  await execa.command(`npm dist-tag add ${packageInfo.packageJson.name}@${newVersion} ${packageInfo.packageHash}`, {
    stdio: 'inherit',
  })

  log('published npm target in package: "%s"', packageInfo.packageJson.name)

  return { published: true, newVersion, packagePath: packageInfo.packagePath }
}

async function publishDocker(
  packageInfo: Omit<PackageInfo, 'targets'>,
  target: DockerTargetInfo,
  options: { rootPath: string; isDryRun: boolean },
): Promise<PublishResult> {
  log('publishing docker target in package: "%s"', packageInfo.packageJson.name)

  const dockerLatestTag = target.docker.latestTag?.tag

  if (dockerLatestTag === packageInfo.packageJson.version) {
    // it looks like someone manually published the promoted version before the ci publish it. all in all, the result in valid.
    return { published: true, newVersion: packageInfo.packageJson.version, packagePath: packageInfo.packagePath }
  }

  const newTag = packageInfo.packageJson.version

  const dockerImageWithRepo = `stavalfi/${packageInfo.packageJson.name}`

  log('building docker image "%s" in package: "%s"', dockerImageWithRepo, packageInfo.packageJson.name)

  await execa.command(
    `docker build --label latest-hash=${packageInfo.packageHash} --label latest-tag=${newTag} -f Dockerfile -t ${dockerImageWithRepo}:latest ${options.rootPath}`,
    {
      cwd: packageInfo.packagePath,
      stdio: 'inherit',
    },
  )
  log('built docker image "%s" in package: "%s"', dockerImageWithRepo, packageInfo.packageJson.name)
  log(
    'creating tags: "%s" and "%s" to docker image "%s" in package: "%s"',
    newTag,
    dockerImageWithRepo,
    packageInfo.packageHash,
    packageInfo.packageJson.name,
  )
  await execa.command(`docker tag ${dockerImageWithRepo}:latest ${dockerImageWithRepo}:${newTag}`, { stdio: 'inherit' })
  await execa.command(`docker tag ${dockerImageWithRepo}:latest ${dockerImageWithRepo}:${packageInfo.packageHash}`, {
    stdio: 'inherit',
  })

  if (options.isDryRun) {
    return { published: false, packagePath: packageInfo.packagePath }
  }

  await execa.command(`docker push ${dockerImageWithRepo}:latest`, { stdio: 'inherit' })
  await execa.command(`docker push ${dockerImageWithRepo}:${newTag}`, { stdio: 'inherit' })
  await execa.command(`docker push ${dockerImageWithRepo}:${packageInfo.packageHash}`, {
    stdio: 'inherit',
  })

  log('published docker target in package: "%s"', packageInfo.packageJson.name)

  return { published: true, newVersion: newTag, packagePath: packageInfo.packagePath }
}

export async function publish(orderedGraph: Graph<PackageInfo>, options: { rootPath: string; isDryRun: boolean }) {
  const toPublish = orderedGraph.map(node => node.data).filter(shouldPublish)

  // todo: optimize it even more - we can run all in parallel but we must make sure that every docker has all it's npm dep already published
  const npm = toPublish.filter(data => data.targets.some(target => target.targetType === TargetType.npm))
  const docker = toPublish.filter(data => data.targets.some(target => target.targetType === TargetType.docker))

  if (toPublish.length === 0) {
    log(`there is no need to publish anything. all packages that should publish, didn't change.`)
  } else {
    log('publishing the following packages: %s', toPublish.map(node => `"${node.packageJson.name}"`).join(', '))
    if (!options.isDryRun && docker.length > 0) {
      log('logging in to docker-hub registry')
      await execa.command(
        // eslint-disable-next-line no-process-env
        `docker login --username=${process.env.DOCKER_HUB_USERNAME} --password=${process.env.DOCKER_HUB_TOKEN}`,
        { stdio: 'inherit' },
      )
      log('logged in to docker-hub registry')
    }

    const npmResult = await Promise.all(
      npm.map(node =>
        publishNpm(node, node.targets.find(target => target.targetType === TargetType.npm) as NpmTargetInfo, {
          isDryRun: options.isDryRun,
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
        publishDocker(node, node.targets.find(target => target.targetType === TargetType.docker) as DockerTargetInfo, {
          rootPath: options.rootPath,
          isDryRun: options.isDryRun,
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
