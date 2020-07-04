// eslint-disable-next-line @typescript-eslint/no-var-requires
const execa = require('execa')

module.exports = async () => {
  const command = `${require.resolve('k8test/dist/src/index.js')} start-monitoring --local-image --namespace k8test-ci`
  // eslint-disable-next-line no-console
  console.log('stav1', `executing: "${command}"`)
  await execa.command(command, {
    stdio: 'inherit',
  })
}
