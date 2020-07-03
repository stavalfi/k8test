import { newEnv } from './prepare-test'
import { TargetType } from './prepare-test/types'

const { createRepo } = newEnv()

test(`run ci as the first time after there is already an npm publish`, async () => {
  const { runCi, publishNpmPackageWithoutCi } = await createRepo({
    packages: [
      {
        name: 'a',
        version: '1.0.0',
        targetType: TargetType.npm,
      },
    ],
  })

  await publishNpmPackageWithoutCi('a')

  const master = await runCi({
    isMasterBuild: true,
  })
  expect(master.published.get('a')?.npm?.versions).toEqual(['1.0.0', '1.0.1'])
  expect(master.published.get('a')?.npm?.latestVersion).toEqual('1.0.1')
})

test(`run ci -> unpublish npm whiling keeping hash tags -> run ci`, async () => {
  const { runCi, unpublishNpmPackage } = await createRepo({
    packages: [
      {
        name: 'a',
        version: '1.0.0',
        targetType: TargetType.npm,
      },
    ],
  })

  await runCi({
    isMasterBuild: true,
  })

  await unpublishNpmPackage('a', '1.0.0')

  const master = await runCi({
    isMasterBuild: true,
  })

  expect(master.published.get('a')?.npm?.versions).toEqual(['1.0.0'])
  expect(master.published.get('a')?.npm?.latestVersion).toEqual('1.0.0')
})

test(`run ci -> remove all npm hash tags -> run ci`, async () => {
  const { runCi, removeAllNpmHashTags } = await createRepo({
    packages: [
      {
        name: 'a',
        version: '1.0.0',
        targetType: TargetType.npm,
      },
    ],
  })

  await runCi({
    isMasterBuild: true,
  })

  await removeAllNpmHashTags('a')

  const master = await runCi({
    isMasterBuild: true,
  })

  expect(master.published.get('a')?.npm?.versions).toEqual(['1.0.0', '1.0.1'])
  expect(master.published.get('a')?.npm?.latestVersion).toEqual('1.0.1')
})

test('run ci -> change packageJson.version to invalid version -> run ci', async () => {
  const { runCi, modifyPackageJson } = await createRepo({
    packages: [
      {
        name: 'a',
        version: '1.0.0',
        targetType: TargetType.npm,
      },
    ],
  })

  await modifyPackageJson('a', async packageJson => ({ ...packageJson, version: 'lalalal' }))

  await expect(
    runCi({
      isMasterBuild: true,
    }),
  ).rejects.toThrow('package a has invalid version. please fix it.')
})

describe('run ci -> increase packageJson.version -> run ci', () => {
  test('run ci -> increase packageJson.version in major -> run ci', async () => {
    const { runCi, modifyPackageJson } = await createRepo({
      packages: [
        {
          name: 'a',
          version: '1.0.0',
          targetType: TargetType.npm,
        },
      ],
    })

    await runCi({
      isMasterBuild: true,
    })

    await modifyPackageJson('a', async packageJson => ({ ...packageJson, version: '2.0.0' }))

    const master = await runCi({
      isMasterBuild: true,
    })

    expect(master.published.get('a')?.npm?.versions).toEqual(['1.0.0', '2.0.0'])
    expect(master.published.get('a')?.npm?.latestVersion).toEqual('2.0.0')
  })

  test('run ci -> increase packageJson.version in minor -> run ci', async () => {
    const { runCi, modifyPackageJson } = await createRepo({
      packages: [
        {
          name: 'a',
          version: '1.0.0',
          targetType: TargetType.npm,
        },
      ],
    })

    await runCi({
      isMasterBuild: true,
    })

    await modifyPackageJson('a', async packageJson => ({ ...packageJson, version: '1.1.0' }))

    const master = await runCi({
      isMasterBuild: true,
    })
    expect(master.published.get('a')?.npm?.versions).toEqual(['1.0.0', '1.1.0'])
    expect(master.published.get('a')?.npm?.latestVersion).toEqual('1.1.0')
  })

  test('run ci -> increase packageJson.version in patch (should be next version anyway) -> run ci', async () => {
    const { runCi, modifyPackageJson } = await createRepo({
      packages: [
        {
          name: 'a',
          version: '1.0.0',
          targetType: TargetType.npm,
        },
      ],
    })

    await runCi({
      isMasterBuild: true,
    })

    await modifyPackageJson('a', async packageJson => ({ ...packageJson, version: '1.0.1' }))

    const master = await runCi({
      isMasterBuild: true,
    })
    expect(master.published.get('a')?.npm?.versions).toEqual(['1.0.0', '1.0.1'])
    expect(master.published.get('a')?.npm?.latestVersion).toEqual('1.0.1')
  })

  test('run ci -> increase packageJson.version in patch -> run ci', async () => {
    const { runCi, modifyPackageJson } = await createRepo({
      packages: [
        {
          name: 'a',
          version: '1.0.0',
          targetType: TargetType.npm,
        },
      ],
    })

    await runCi({
      isMasterBuild: true,
    })

    await modifyPackageJson('a', async packageJson => ({ ...packageJson, version: '1.0.4' }))

    const master = await runCi({
      isMasterBuild: true,
    })
    expect(master.published.get('a')?.npm?.versions).toEqual(['1.0.0', '1.0.4'])
    expect(master.published.get('a')?.npm?.latestVersion).toEqual('1.0.4')
  })
})

describe('run ci -> decrease packageJson.version -> run ci', () => {
  test('to unpublished version', async () => {
    const { runCi, modifyPackageJson } = await createRepo({
      packages: [
        {
          name: 'a',
          version: '1.0.10',
          targetType: TargetType.npm,
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

    expect(master.published.get('a')?.npm?.versions).toEqual(['1.0.10', '1.0.11'])
    expect(master.published.get('a')?.npm?.latestVersion).toEqual('1.0.11')
  })

  test('to published version', async () => {
    const { runCi, modifyPackageJson } = await createRepo({
      packages: [
        {
          name: 'a',
          version: '1.0.0',
          targetType: TargetType.npm,
        },
      ],
    })

    await runCi({
      isMasterBuild: true,
    })

    await runCi({
      isMasterBuild: true,
    })

    await runCi({
      isMasterBuild: true,
    })

    await modifyPackageJson('a', async packageJson => ({ ...packageJson, version: '1.0.1' }))

    const master = await runCi({
      isMasterBuild: true,
    })

    expect(master.published.get('a')?.npm?.versions).toEqual(['1.0.0', '1.0.1', '1.0.2', '1.0.3'])
    expect(master.published.get('a')?.npm?.latestVersion).toEqual('1.0.3')
  })
})
