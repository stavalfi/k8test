// eslint-disable-next-line @typescript-eslint/no-var-requires
const execa = require('execa')

module.exports = async () => {
  const command = `node --unhandled-rejections=strict ${require.resolve(
    'k8test/dist/src/index.js',
  )} start-monitoring --local-image --namespace k8test-ci`
  await execa.command(command, {
    stdio: 'inherit',
  })
}
