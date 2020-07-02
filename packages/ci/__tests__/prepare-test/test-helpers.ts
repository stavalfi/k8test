import chance from 'chance'
import execa from 'execa'
import fse from 'fs-extra'
import path from 'path'
import { ServerInfo } from '../../src/types'
import { CreateAndManageRepo, TargetType, ToActualName } from './types'
import { getPackages } from './utils'

export async function commitAllAndPushChanges(repoPath: string, gitRepoAddress: string) {
  await execa.command('git add --all', { cwd: repoPath })
  await execa.command('git commit -m init', { cwd: repoPath })
  await execa.command(`git push ${gitRepoAddress}`, { cwd: repoPath })
}

export const addRandomFileToPackage = ({
  repoPath,
  toActualName,
  gitRepoAddress,
}: {
  toActualName: ToActualName
  repoPath: string
  gitRepoAddress: string
}) => async (packageName: string): Promise<string> => {
  const packagesPath = await getPackages(repoPath)
  const packagePath = packagesPath.find(path => path.endsWith(toActualName(packageName)))
  if (!packagePath) {
    throw new Error(`package "${packageName}" not found in [${packagesPath.join(', ')}]`)
  }
  const filePath = path.join(repoPath, `random-file-${chance().hash()}`)
  await fse.writeFile(path.join(repoPath, `random-file-${chance().hash()}`), '')

  await commitAllAndPushChanges(repoPath, gitRepoAddress)
  return filePath
}

export const runDockerImage = async (fullDockerImageName: string): Promise<execa.ExecaChildProcess> => {
  const containerName = `container-${chance().hash()}`

  return execa.command(`docker run --name ${containerName} ${fullDockerImageName}`).finally(async () => {
    await execa.command(`docker rm ${containerName}`).catch(() => {
      /**/
    })
  })
}

export const installAndRunNpmDependency = async ({
  toActualName,
  createRepo,
  npmRegistry,
  dependencyName,
}: {
  toActualName: ToActualName
  npmRegistry: ServerInfo
  createRepo: CreateAndManageRepo
  dependencyName: string
}): Promise<execa.ExecaChildProcess<string>> => {
  const { getPackagePath } = await createRepo({
    packages: [
      {
        name: 'b',
        version: '2.0.0',
        targetType: TargetType.none,
        dependencies: {
          [toActualName(dependencyName)]: `${npmRegistry.protocol}://${npmRegistry.host}:${
            npmRegistry.port
          }/${toActualName(dependencyName)}/-/${toActualName(dependencyName)}-1.0.0.tgz`,
        },
        'index.js': `require("${toActualName(dependencyName)}")`,
      },
    ],
  })
  return execa.node(path.join(await getPackagePath('b'), 'index.js'))
}

export const addRandomFileToRoot = ({
  repoPath,
  gitRepoAddress,
}: {
  repoPath: string
  gitRepoAddress: string
}) => async (): Promise<string> => {
  const filePath = path.join(repoPath, `random-file-${chance().hash()}`)
  await fse.writeFile(path.join(repoPath, `random-file-${chance().hash()}`), '')

  await commitAllAndPushChanges(repoPath, gitRepoAddress)
  return filePath
}
