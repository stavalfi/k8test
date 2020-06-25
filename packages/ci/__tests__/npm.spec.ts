import { newEnv } from './prepare-test'

describe('npm', () => {
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
})
