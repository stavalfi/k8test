/* eslint-disable @typescript-eslint/no-var-requires */

const k8test = require('k8test')
const baseConfig = require('../../base-jest.config')
const deepmerge = require('deepmerge')
const path = require('path')

module.exports = deepmerge(baseConfig, {
  testMatch: ['/Users/stavalfi/projects/k8test/packages/ci/__tests__/npm.spec.ts'],
  globalSetup: path.join(__dirname, 'jest-global-setup.js'),
  globals: {
    APP_ID: k8test.randomAppId(),
  },
})
