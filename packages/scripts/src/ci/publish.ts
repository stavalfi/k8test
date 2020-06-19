import path from 'path'
import execa from 'execa'
import fs from 'fs-extra'
import { PackageInfo, Graph } from './types'
import k8testLog from 'k8test-log'
import _ from 'lodash'

const log = k8testLog('scripts:ci:publish')

type PublishResult = {
  skip?: boolean
  published?: boolean
  newVersion?: string
  packageInfo: PackageInfo
}

async function publishNpm(packageInfo: PackageInfo, options: { isDryRun: boolean }): Promise<PublishResult> {
  if (!packageInfo.npm) {
    return { skip: true, packageInfo }
  }

  if (packageInfo.npm.isAlreadyPublished) {
    return { skip: true, packageInfo }
  }

  log('publishing npm target in package: "%s"', packageInfo.packageJson.name)

  const npmLatestVersion = packageInfo.npm.latestVersion?.version

  if (npmLatestVersion && npmLatestVersion !== packageInfo.packageJson.version) {
    throw new Error(
      `mismatch: latest npm version of ${packageInfo.packagePath} in npm-registry is ${npmLatestVersion}, but in package.json it is: ${packageInfo.packageJson.version}. please make sure they are synced before you run this script again.`,
    )
  }

  if (options.isDryRun) {
    return { published: false, packageInfo }
  }

  await execa.command(`yarn --cwd ${packageInfo.packagePath} version --patch --no-git-tag-version`, {
    stdio: 'inherit',
  })

  const newVersion = (await fs.readJson(path.join(packageInfo.packagePath, 'package.json'))).version

  await execa.command(`yarn publish ${packageInfo.packagePath}`, { stdio: 'inherit' })

  // yarn tag add - is not working
  await execa.command(`npm dist-tag add ${packageInfo.packageJson.name}@${newVersion} ${packageInfo.packageHash}`, {
    stdio: 'inherit',
  })

  log('published npm target in package: "%s"', packageInfo.packageJson.name)

  return { published: true, newVersion, packageInfo }
}

async function publishDocker(
  packageInfo: PackageInfo,
  options: { rootPath: string; isDryRun: boolean },
): Promise<PublishResult> {
  if (!packageInfo.docker) {
    return { skip: true, packageInfo }
  }

  if (packageInfo.docker.isAlreadyPublished) {
    return { skip: true, packageInfo }
  }

  log('publishing docker target in package: "%s"', packageInfo.packageJson.name)

  const dockerLatestTag = packageInfo.docker.latestTag?.tag

  if (dockerLatestTag && dockerLatestTag !== packageInfo.packageJson.version) {
    throw new Error(
      `mismatch: latest docker tag of ${packageInfo.packagePath} in docker-registry is ${dockerLatestTag}, but in package.json it is: ${packageInfo.packageJson.version}. please make sure they are synced before you run this script again.`,
    )
  }

  await execa.command(`yarn --cwd ${packageInfo.packagePath} version --patch --no-git-tag-version`, {
    stdio: 'inherit',
  })

  const newTag = (await fs.readJson(path.join(packageInfo.packagePath, 'package.json'))).version

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
    return { published: false, packageInfo }
  }

  await execa.command(`docker push ${dockerImageWithRepo}:latest`, { stdio: 'inherit' })
  await execa.command(`docker push ${dockerImageWithRepo}:${newTag}`, { stdio: 'inherit' })
  await execa.command(`docker push ${dockerImageWithRepo}:${packageInfo.packageHash}`, {
    stdio: 'inherit',
  })

  log('published docker target in package: "%s"', packageInfo.packageJson.name)

  return { published: true, packageInfo }
}

export async function publish(orderedGraph: Graph<PackageInfo>, options: { rootPath: string; isDryRun: boolean }) {
  const toPublish = orderedGraph
    .filter(
      node =>
        (node.data.docker && !node.data.docker.isAlreadyPublished) ||
        (node.data.npm && !node.data.npm.isAlreadyPublished),
    )
    .map(node => node.data)

  // todo: optimize it even more - we can run all in parallel but we must make sure that every docker has all it's npm dep already published
  const npm = toPublish.filter(data => data.npm && !data.npm.isAlreadyPublished)
  const docker = toPublish.filter(data => data.docker && !data.docker.isAlreadyPublished)

  if (toPublish.length === 0) {
    log(`there is no need to publish anything. all packages that should publish, didn't change.`)
  } else {
    log('publishing the following packages: %s', toPublish.map(node => `"${node.packageJson.name}"`).join(', '))
    if (!options.isDryRun) {
      log('logging in to docker-hub registry')
      await execa.command(
        // eslint-disable-next-line no-process-env
        `docker login --username=${process.env.DOCKER_HUB_USERNAME} --password=${process.env.DOCKER_HUB_PASSWORD}`,
        { stdio: 'inherit' },
      )
      log('logged in to docker-hub registry')
    }

    const npmResult = await Promise.all(npm.map(node => publishNpm(node, { isDryRun: options.isDryRun })))
    log(
      `npm publish results: %O`,
      JSON.stringify(
        npmResult.map(node => _.omit(node, ['packageInfo.packageJson'])),
        null,
        2,
      ),
    )

    const dockerResult = await Promise.all(
      docker.map(node => publishDocker(node, { rootPath: options.rootPath, isDryRun: options.isDryRun })),
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
