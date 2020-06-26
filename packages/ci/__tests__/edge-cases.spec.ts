import { newEnv } from './prepare-test'
import { TargetType } from './prepare-test/types'

const createRepo = newEnv()

test('empty repo', async () => {
  const ci = await createRepo()
  const pr = await ci({
    isMasterBuild: false,
  })
  expect(pr.published).toHaveProperty('size', 0)
  const master = await ci({
    isMasterBuild: true,
  })
  expect(master.published).toHaveProperty('size', 0)
})

test('artifacts without targets', async () => {
  const ci = await createRepo({
    packages: [
      {
        name: 'a',
        version: '1.0.0',
        targetType: TargetType.none,
      },
    ],
  })
  const pr = await ci({
    isMasterBuild: false,
  })
  expect(pr.published).toHaveProperty('size', 0)
  const master = await ci({
    isMasterBuild: true,
  })
  expect(master.published).toHaveProperty('size', 0)
})
