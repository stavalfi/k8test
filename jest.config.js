const path = require('path')
const execa = require('execa')
const { isCI } = require('ci-info')

const result = execa.sync('yarn', 'workspaces --json info'.split(' '))

const workspacesInfo = JSON.parse(JSON.parse(result.stdout).data)
const packagesAliases = Object.values(workspacesInfo)
  .map(workspaceInfo => workspaceInfo.location)
  .map(packagePath => ({
    [`^${require(path.join(__dirname, packagePath, 'package.json')).name}$`]: path.join(
      __dirname,
      packagePath,
      'src',
      'index.ts',
    ),
  }))
  .reduce((acc, obj) => ({ ...acc, ...obj }), {})

const config = {
  testRunner: 'jest-circus/runner',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testRegex: [`./*.spec.ts$`],
  moduleNameMapper: packagesAliases,
  setupFilesAfterEnv: [path.join(__dirname, 'jest.setup.js')],
  globals: {
    'ts-jest': {
      tsConfig: {
        esModuleInterop: true,
      },
    },
  },
}

if (isCI) {
  config.maxWorkers = 7
}

module.exports = config
