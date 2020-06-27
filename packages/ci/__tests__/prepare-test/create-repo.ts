import { createFolder } from 'create-folder-structure'
import execa from 'execa'
import { GitServer } from './git-server-testkit'
import { Repo, TargetType } from './types'

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
    stdio: 'inherit',
  })
}

export async function createRepo(repo: Repo, gitServer: GitServer, toActualName: (name: string) => string) {
  const repoOrg = toActualName('org')
  const repoName = toActualName('repo')

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
        packageInfo.name,
        {
          'package.json': {
            name: toActualName(packageInfo.name),
            version: packageInfo.version,
            private: packageInfo.targetType !== TargetType.npm,
            ...(packageInfo.dependencies && {
              dependencies: Object.fromEntries(
                Object.entries(packageInfo.dependencies).map(([key, value]) => [toActualName(key), value]),
              ),
            }),
            ...(packageInfo.devDependencies && {
              devDependencies: Object.fromEntries(
                Object.entries(packageInfo.devDependencies).map(([key, value]) => [toActualName(key), value]),
              ),
            }),
          },
          ...(packageInfo.src && {
            src: packageInfo.src,
          }),
          ...(packageInfo.tests && {
            tests: packageInfo.tests,
          }),
          ...(packageInfo.targetType === TargetType.docker && {
            Dockerfile: `FROM node`,
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
