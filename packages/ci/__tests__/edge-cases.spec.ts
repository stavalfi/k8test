import { newEnv } from './prepare-test'
import { TargetType } from './prepare-test/types'

const { createRepo } = newEnv()

test('empty repo', async () => {
  const { runCi } = await createRepo()
  const pr = await runCi({
    isMasterBuild: false,
  })
  expect(pr.published).toHaveProperty('size', 0)
  const master = await runCi({
    isMasterBuild: true,
  })
  expect(master.published).toHaveProperty('size', 0)
})

test('artifacts without targets', async () => {
  const { runCi } = await createRepo({
    packages: [
      {
        name: 'a',
        version: '1.0.0',
        targetType: TargetType.none,
      },
    ],
  })
  const pr = await runCi({
    isMasterBuild: false,
  })
  expect(pr.published).toHaveProperty('size', 0)
  const master = await runCi({
    isMasterBuild: true,
  })
  expect(master.published).toHaveProperty('size', 0)
})
