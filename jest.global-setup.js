const execa = require('execa')

module.exports = async () => {
  await execa.command('eval $(minikube docker-env --shell sh)', {
    shell: true,
  })
}
