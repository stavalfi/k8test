// eslint-disable-next-line @typescript-eslint/no-var-requires
const execa = require('execa')

module.exports = async () => {
  await execa.command(`node ${require.resolve('k8test/dist/src/index.js')} start-monitoring --local-image`)
}
