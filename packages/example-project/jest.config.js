/* eslint-disable @typescript-eslint/no-var-requires */

const k8test = require('k8test')
const baseConfig = require('../../base-jest.config')
const deepmerge = require('deepmerge')
const path = require('path')

module.exports = deepmerge(baseConfig, {
  testMatch: [path.join(__dirname, '__tests__/**/*.spec.ts')],
  globals: {
    APP_ID: k8test.randomAppId(),
  },
})
