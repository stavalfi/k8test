/* eslint-disable @typescript-eslint/no-var-requires */

const execa = require('execa')
const ciInfo = require('ci-info')

module.exports = async () => {
  const command = `node --unhandled-rejections=strict ${require.resolve(
    'k8test/dist/src/index.js',
  )} start-monitoring --local-image --namespace k8test-ci`
  await execa.command(command, {
    stdio: 'inherit',
  })

  if (ciInfo.isCI) {
    // in the tests of this package, we create git-repos and do commits so we need a git-user.
    await execa.command(`git config --global user.email "test@test.com"`)
    await execa.command(`git config --global user.name "test-user"`)
  }
}
