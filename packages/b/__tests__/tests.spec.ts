import { createFolder } from 'create-folder-structure'
import chance from 'chance'
import execa from 'execa'
import path from 'path'

const jestCli = require.resolve('.bin/jest')
const k8sTestCli = path.join(__dirname, '../src/index.ts')

describe('1', () => {
  test('2', async () => {
    const [key, value] = [chance().hash(), chance().hash()]
    const projectPath = await createFolder({
      'pakage.json': {
        scripts: {
          test: jestCli,
        },
        devDependencies: {
          jest: '24.8.0',
        },
      },
      __tests__: {
        'test1.k8test.spec.js': `describe('1', () => {
          test('2', async () => {
            expect(process.env["KUBERNETES_SERVICE_HOST"]).toBeTruthy()
            expect(process.env["${key}"]).toEqual("${value}")
          })
        })`,
      },
    })
    const result = await execa.command(`${k8sTestCli} --env ${key}=${value}`, { cwd: projectPath })
    expect(result.exitCode).toEqual(0)
  })
})
