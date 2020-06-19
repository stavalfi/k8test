import path from 'path'
import execa from 'execa'
import fs from 'fs-extra'
import glob from 'fast-glob'

const isChildOf = (parent: string, child: string) => {
  if (child === parent) return false
  const parentTokens = parent.split('/').filter(i => i.length)
  return parentTokens.every((t, i) => child.split('/')[i] === t)
}

export async function calculatePackagesHash(rootPath: string) {
  const result = await execa.command('yarn workspaces --json info', {
    cwd: rootPath,
  })
  const workspacesInfo: { location: string }[] = JSON.parse(JSON.parse(result.stdout).data)
  const packages = Object.values(workspacesInfo)
    .map(workspaceInfo => workspaceInfo.location)
    .map(relativePackagePath => path.join(rootPath, relativePackagePath))

  const parseGitLs = (stdout: string) =>
    stdout
      .split('\n')
      .map(line =>
        line
          .split(' ')
          .slice(2)
          .join('')
          .split('\t'),
      )
      .map(([hash, relativeFilePath]) => ({ hash, relativeFilePath }))

  const allFilesResult = await execa.command('git ls-tree -r head', {
    cwd: rootPath,
  })

  const allFilesInfo = parseGitLs(allFilesResult.stdout)

  const rootFilesInfo = allFilesInfo.filter(({ relativeFilePath }) => !relativeFilePath.startsWith('packages'))

  console.log(rootFilesInfo)

  console.log(allFilesInfo)
}

async function calculatePackageHash(packagePath: string) {}

// eslint-disable-next-line no-floating-promise/no-floating-promise
calculatePackagesHash('/Users/stavalfi-dev/projects/k8test')
