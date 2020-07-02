import { createFolder } from 'create-folder-structure'
import execa from 'execa'
import { GitServer } from './git-server-testkit'
import { Repo, TargetType, ToActualName } from './types'
import chance from 'chance'

async function initializeGitRepo({
  gitServer,
  name,
  org,
  repoPath,
}: {
  repoPath: string
  org: string
  name: string
  gitServer: GitServer
}) {
  await execa.command('git init', { cwd: repoPath })
  await execa.command('git add --all', { cwd: repoPath })
  await execa.command('git commit -m init', { cwd: repoPath })

  await gitServer.createRepository(org, name)

  await execa.command(`git push ${gitServer.generateGitRepositoryAddress(org, name)} -u master`, {
    cwd: repoPath,
  })
}

export async function createRepo({
  toActualName,
  repo,
  gitServer,
}: {
  repo: Repo
  gitServer: GitServer
  toActualName: ToActualName
}) {
  const repoOrg = toActualName('org')
  const repoName = `repo-${chance()
    .hash()
    .slice(0, 8)}`

  const isFromThisMonorepo = (depName: string) => repo.packages?.some(packageInfo => packageInfo.name === depName)

  const repoPath = await createFolder({
    'package.json': {
      name: repoName,
      version: '1.0.0',
      private: true,
      workspaces: ['packages/*'],
      scripts: {
        test: 'echo running tests..... no tests to run',
      },
    },
    '.dockerignore': `node_modules`,
    '.gitignore': 'node_modules',
    packages: Object.fromEntries(
      repo.packages?.map(packageInfo => [
        toActualName(packageInfo.name),
        {
          'package.json': {
            name: toActualName(packageInfo.name),
            version: packageInfo.version,
            private: packageInfo.targetType !== TargetType.npm,
            ...(packageInfo['index.js'] && { main: 'index.js' }),
            ...(packageInfo.dependencies && {
              dependencies: Object.fromEntries(
                Object.entries(packageInfo.dependencies).map(([key, value]) => [
                  isFromThisMonorepo(key) ? toActualName(key) : key,
                  value,
                ]),
              ),
            }),
            ...(packageInfo.devDependencies && {
              devDependencies: Object.fromEntries(
                Object.entries(packageInfo.devDependencies).map(([key, value]) => [
                  isFromThisMonorepo(key) ? toActualName(key) : key,
                  value,
                ]),
              ),
            }),
          },
          ...(packageInfo['index.js'] && { 'index.js': packageInfo['index.js'] }),
          ...(packageInfo.src && {
            src: packageInfo.src,
          }),
          ...(packageInfo.tests && {
            tests: packageInfo.tests,
          }),
          ...(packageInfo.targetType === TargetType.docker && {
            Dockerfile: `\
            FROM alpine
            CMD ["echo","hello"]
            `,
          }),
          ...packageInfo.additionalFiles,
        },
      ]) || [],
    ),
    ...repo.rootFiles,
  })

  await execa.command(`yarn install`, { cwd: repoPath })

  await initializeGitRepo({
    gitServer,
    repoPath,
    org: repoOrg,
    name: repoName,
  })

  return {
    repoPath,
    repoName,
    repoOrg,
  }
}
