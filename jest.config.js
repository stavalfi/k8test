/* eslint-disable @typescript-eslint/no-var-requires */

const path = require('path')
const execa = require('execa')

const result = execa.sync('yarn', 'workspaces --json info'.split(' '))

const workspacesInfo = JSON.parse(JSON.parse(result.stdout).data)

module.exports = {
  projects: Object.values(workspacesInfo)
    .map(workspaceInfo => workspaceInfo.location)
    .map(packagePath => path.join(__dirname, packagePath, 'jest.config.js')),
}
