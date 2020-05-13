import execa from 'execa'
import fs from 'fs-extra'
import path from 'path'

const ENTRIES_TO_REMOVE = ['dist', 'tsconfig-build.tsbuildinfo', 'tsconfig.tsbuildinfo']

const result = execa.sync('yarn', 'workspaces --json info'.split(' '))

const workspacesInfo = JSON.parse(JSON.parse(result.stdout).data)
const entriesToRemove = Object.values<{ location: string }>(workspacesInfo)
  .map(workspaceInfo => workspaceInfo.location)
  .concat([path.join(__dirname, '..')]) // also add the main workspace path
  .flatMap(workspaceLocation => ENTRIES_TO_REMOVE.map(entry => `${workspaceLocation}/${entry}`))

Promise.all(entriesToRemove.map(entryPath => fs.remove(entryPath)))
