import path from 'path'
import execa from 'execa'
import fs from 'fs-extra'

const getRootPath = () => path.join(__dirname, '../../../')

async function getNpmLatestVersionInfo(
  packageName: string,
): Promise<{ latestVersionHash: string; latestVersion: string } | undefined> {
  try {
    const result = await execa.command(`npm view ${packageName} --json`, {})
    const resultJson = JSON.parse(result.stdout) || {}
    const distTags = resultJson['dist-tags']
    return {
      latestVersionHash: distTags['latest-hash'],
      latestVersion: distTags['latest'],
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e)
  }
}

async function getDockerLatestTagInfo(
  imageNameWithRepository: string,
): Promise<{ latestTagHash: string; latestTag: string } | undefined> {
  try {
    const result = await execa.command(`skopeo inspect docker://docker.io/${imageNameWithRepository}:latest --raw`)
    const resultJson = JSON.parse(result.stdout) || {}
    return {
      latestTagHash: resultJson.Labels?.['latest-hash'],
      latestTag: resultJson.Labels?.['latest-tag'],
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e)
  }
}

async function calculatePackageHash(packagePath: string): Promise<string> {
  const result = await execa.command(`git ls-files -s ${packagePath} | git hash-object --stdin`)
  return result.stdout
}

type PackageInfo = {
  packagePath: string
  packageJson: { name: string; version: string; private?: boolean }
  currentHash: string
  npm?: {
    isAlreadyPublished: boolean
    latestVersion?: { version: string; hash: string }
  }
  docker?: {
    isAlreadyPublished: boolean
    latestTag?: { tag: string; hash: string }
  }
}

async function getPackageInfo(packagePath: string, index: number, packagesPath: string[]): Promise<PackageInfo> {
  const packageJson = await fs.readJson(path.join(packagePath, 'package.json'))
  // @ts-ignore
  const isDocker: boolean = await fs.exists(path.join(packagePath, 'Dockerfile'))
  const isNpm = !packageJson.private
  const currentHash = await calculatePackageHash(packagePath)
  const npmLatestVersionInfo = await getNpmLatestVersionInfo(packageJson.name)
  const dockerLatestTagInfo = await getDockerLatestTagInfo(packageJson.name)
  const isDockerAlreadyPublished = await execa
    .command(`docker manifest inspect stavalfi/${packageJson.name}:${currentHash}`, {
      env: {
        DOCKER_CLI_EXPERIMENTAL: 'enabled',
      },
    })
    .then(
      () => true,
      e => Promise.reject(e),
    )
  const isNpmAlreadyPublished = await execa.command(`npm view ${packageJson.name}:${currentHash}`, {}).then(
    () => true,
    e => (e.code === 'E404' ? false : Promise.reject(e)),
  )
  return {
    packagePath,
    packageJson,
    currentHash,
    ...(isNpm && {
      npm: {
        isAlreadyPublished: isNpmAlreadyPublished,
        ...(npmLatestVersionInfo && {
          latestVersion: {
            version: npmLatestVersionInfo.latestVersion,
            hash: npmLatestVersionInfo.latestVersionHash,
          },
        }),
      },
    }),
    ...(isDocker && {
      docker: {
        isAlreadyPublished: isDockerAlreadyPublished,
        ...(dockerLatestTagInfo && {
          latestTag: {
            tag: dockerLatestTagInfo.latestTag,
            hash: dockerLatestTagInfo.latestTagHash,
          },
        }),
      },
    }),
  }
}

type PublishResult = {
  skip?: boolean
  published?: boolean
  newVersion?: string
  packageInfo: PackageInfo
}

async function publishNpm(packageInfo: PackageInfo): Promise<PublishResult> {
  if (!packageInfo.npm) {
    return { skip: true, packageInfo }
  }

  if (packageInfo.npm.isAlreadyPublished) {
    return { skip: true, packageInfo }
  }

  const npmLatestVersion = packageInfo.npm.latestVersion?.version

  if (npmLatestVersion !== packageInfo.packageJson.version) {
    throw new Error(
      `mismatch: latest npm version of ${packageInfo.packagePath} in npm-registry is ${npmLatestVersion}, but in package.json it is: ${packageInfo.packageJson.version}. please make sure they are synced before you run this script again.`,
    )
  }

  await execa.command(`yarn --cwd ${packageInfo.packagePath} version --patch --no-git-tag-version`)

  const newVersion = (await fs.readJson(path.join(packageInfo.packagePath, 'package.json'))).version

  await execa.command(`yarn publish ${packageInfo.packagePath}`)

  await execa.command(`yarn tag add ${packageInfo.packageJson.name}@${newVersion} ${packageInfo.currentHash}`)

  return { published: true, newVersion, packageInfo }
}

async function publishDocker(packageInfo: PackageInfo): Promise<PublishResult> {
  if (!packageInfo.docker) {
    return { skip: true, packageInfo }
  }

  if (packageInfo.docker.isAlreadyPublished) {
    return { skip: true, packageInfo }
  }

  const dockerLatestTag = packageInfo.docker.latestTag?.tag

  if (dockerLatestTag !== packageInfo.packageJson.version) {
    throw new Error(
      `mismatch: latest docker tag of ${packageInfo.packagePath} in docker-registry is ${dockerLatestTag}, but in package.json it is: ${packageInfo.packageJson.version}. please make sure they are synced before you run this script again.`,
    )
  }

  await execa.command(
    // eslint-disable-next-line no-process-env
    `docker login --username=${process.env.DOCKER_HUB_USERNAME} --password=${process.env.DOCKER_HUB_PASSWORD}`,
  )

  await execa.command(`yarn --cwd ${packageInfo.packagePath} version --patch --no-git-tag-version`)

  const newTag = (await fs.readJson(path.join(packageInfo.packagePath, 'package.json'))).version

  const rootPath = getRootPath()

  await execa.command(
    `docker build --label latest-hash=${packageInfo.currentHash} --label latest-tag=${newTag} -f Dockerfile -t stavalfi/${packageInfo.packageJson.name}:latest ${rootPath}`,
    {
      cwd: packageInfo.packagePath,
    },
  )

  await execa.command(
    `docker tag stavalfi/${packageInfo.packageJson.name}:latest stavalfi/${packageInfo.packageJson.name}:${newTag} ${rootPath}`,
    {
      cwd: packageInfo.packagePath,
    },
  )

  await execa.command(
    `docker tag stavalfi/${packageInfo.packageJson.name}:latest stavalfi/${packageInfo.packageJson.name}:${packageInfo.currentHash} ${rootPath}`,
    {
      cwd: packageInfo.packagePath,
    },
  )

  await execa.command(`docker push stavalfi/${packageInfo.packageJson.name}:latest`)
  await execa.command(`docker push stavalfi/${packageInfo.packageJson.name}:${newTag}`)
  await execa.command(`docker push stavalfi/${packageInfo.packageJson.name}:${packageInfo.currentHash}`)

  return { published: true, packageInfo }
}

async function publishPackage(packageInfo: PackageInfo): Promise<PublishResult[]> {
  return Promise.all([publishNpm(packageInfo), publishDocker(packageInfo)])
}

export async function release() {
  const result = await execa.command('yarn workspaces --json info')
  const workspacesInfo: { location: string }[] = JSON.parse(JSON.parse(result.stdout).data)
  const packages = await Promise.all(
    Object.values(workspacesInfo)
      .map(workspaceInfo => workspaceInfo.location)
      .map(relativePackagePath => path.join(getRootPath(), relativePackagePath))
      .map(getPackageInfo),
  )

  const results = await Promise.all(packages.map(publishPackage))

  console.log(results)
}
