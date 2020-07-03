import { newEnv } from '../../prepare-test'
import { TargetType } from '../../prepare-test/types'

const { createRepo } = newEnv()

describe('run ci -> decrease packageJson.version -> run ci', () => {
  test('to unpublished version', async () => {
    const { runCi, modifyPackageJson } = await createRepo({
      packages: [
        {
          name: 'a',
          version: '1.0.10',
          targetType: TargetType.docker,
        },
      ],
    })

    await runCi({
      isMasterBuild: true,
    })

    await modifyPackageJson('a', async packageJson => ({ ...packageJson, version: '1.0.8' }))

    const master = await runCi({
      isMasterBuild: true,
    })

    expect(master.published.get('a')?.docker?.tags).toEqual(['1.0.10', '1.0.11', 'latest'])
    expect(master.published.get('a')?.docker?.latestTag).toEqual('1.0.11')
  })

  test('to published version', async () => {
    const { runCi, modifyPackageJson, addRandomFileToPackage } = await createRepo({
      packages: [
        {
          name: 'a',
          version: '1.0.0',
          targetType: TargetType.docker,
        },
      ],
    })

    await runCi({
      isMasterBuild: true,
    })

    await addRandomFileToPackage('a')

    await runCi({
      isMasterBuild: true,
    })

    await addRandomFileToPackage('a')

    await runCi({
      isMasterBuild: true,
    })

    await modifyPackageJson('a', async packageJson => ({ ...packageJson, version: '1.0.1' }))

    const master = await runCi({
      isMasterBuild: true,
    })

    expect(master.published.get('a')?.docker?.tags).toEqual(['1.0.0', '1.0.1', '1.0.2', '1.0.3', 'latest'])
    expect(master.published.get('a')?.docker?.latestTag).toEqual('1.0.3')
  })
})
