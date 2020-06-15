import execa from 'execa'

export async function deleteK8testResources() {
  const cliMonitoringPath = require.resolve('k8test-cli-logic/dist/src/index.js')
  await execa.command(`node ${cliMonitoringPath} delete-monitoring`, {
    // eslint-disable-next-line no-process-env
    env: { ...(process.env['DEBUG'] && { DEBUG: process.env['DEBUG'] }) },
    stdio: 'inherit',
  })
}
