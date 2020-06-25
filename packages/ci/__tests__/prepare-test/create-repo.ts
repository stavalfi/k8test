import chance from 'chance'
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

export async function createRepo(repo: Repo, gitServer: GitServer) {
  const repoOrg = `org-${chance()
    .hash()
    .slice(0, 8)}`
  const repoName = `repo-${chance()
    .hash()
    .slice(0, 8)}`

  const repoPath = await createFolder({
    'package.json': {
      name: repoName,
      version: '1.0.0',
      private: true,
      workspaces: ['packages/*'],
    },
    '.dockerignore': `node_modules`,
    '.gitignore': 'node_modules',
    ...repo.packages?.map(packageInfo => [
      packageInfo.name,
      {
        'package.json': {
          name: packageInfo.name,
          version: packageInfo.version,
          private: packageInfo.targetType === TargetType.npm,
          ...(packageInfo.dependencies && {
            dependencies: packageInfo.dependencies,
          }),
          ...(packageInfo.devDependencies && {
            devDependencies: packageInfo.devDependencies,
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
    ]),
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
