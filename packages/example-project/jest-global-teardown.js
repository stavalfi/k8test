// eslint-disable-next-line @typescript-eslint/no-var-requires
const execa = require('execa')

module.exports = async () => {
  await execa.command(`${require.resolve('k8test/dist/src/k8test-cli.js')} delete-monitoring`)
}
