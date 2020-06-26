import execa from 'execa'
import k8testLog from 'k8test-log'
import { Graph, PackageInfo } from './types'

const log = k8testLog('ci:promote')

export async function promote(orderedGraph: Graph<PackageInfo>): Promise<PackageInfo[]> {
  const toPromote = orderedGraph.map(node => node.data).filter(data => data.target?.needPublish)

  if (toPromote.length === 0) {
    log(`there is no need to promote anything. all packages that we should eventually publish, didn't change.`)
    return []
  } else {
    log('promoting the following packages: %s', toPromote.map(node => `"${node.packageJson.name}"`).join(', '))
    await Promise.all(
      toPromote.map(async data => {
        const newVersion = data.target?.needPublish && data.target?.newVersion // it can't be false.
        log(`promoting %s from %s to version %s`, data.relativePackagePath, data.packageJson.version, newVersion)
        await execa.command(`yarn version --new-version ${newVersion} --no-git-tag-version`, {
          stdio: 'ignore',
          cwd: data.packagePath,
        })
      }),
    )
    return toPromote
  }
}
