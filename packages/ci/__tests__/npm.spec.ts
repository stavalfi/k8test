import { newEnv } from './prepare-test'
import { TargetType } from './prepare-test/types'

describe('npm', () => {
  const createRepo = newEnv()

  test('1 package', async () => {
    const ci = await createRepo({
      packages: [
        {
          name: 'a',
          version: '1.0.0',
          targetType: TargetType.npm,
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
    expect(master.published.get('a')?.npm?.versions).toEqual(['1.0.0'])
  })
})
