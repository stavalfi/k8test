import execa from 'execa'
import k8testLog from 'k8test-log'
import { Graph, PackageInfo } from './types'

const log = k8testLog('scripts:ci:promote')

export async function promote(orderedGraph: Graph<PackageInfo>): Promise<PackageInfo[]> {
  const toPromote = orderedGraph
    .map(node => node.data)
    .filter(data => data.target?.needPublish && data.target.newVersion !== data.packageJson.version)

  if (toPromote.length === 0) {
    log(`there is no need to promote anything. all packages that we should eventually publish, didn't change.`)
    return []
  } else {
    log('promoting the following packages: %s', toPromote.map(node => `"${node.packageJson.name}"`).join(', '))
    await Promise.all(
      toPromote.map(data => {
        const newVersion = data.target?.needPublish && data.target?.newVersion // it can't be false.
        log(`promoting %s from %s to version %s`, data.relativePackagePath, data.packageJson.version, newVersion)
        execa.command(`yarn --cwd ${data.packagePath} version --no-git-tag-version ${newVersion}`, {
          stdio: 'inherit',
        })
      }),
    )
    return toPromote
  }
}
