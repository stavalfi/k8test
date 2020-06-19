/* eslint-disable @typescript-eslint/no-var-requires */

const baseConfig = require('../../../base-jest.config')
const deepmerge = require('deepmerge')
const path = require('path')

module.exports = deepmerge(baseConfig, {
  testMatch: [path.join(__dirname, '__tests__/**/*.spec.ts')],
})
