import { newEnv } from '../../prepare-test'
import { TargetType } from '../../prepare-test/types'

const { createRepo } = newEnv()

test(`run ci as the first time after there is already a docker publish`, async () => {
  const { runCi, publishDockerPackageWithoutCi } = await createRepo({
    packages: [
      {
        name: 'a',
        version: '1.0.0',
        targetType: TargetType.docker,
      },
    ],
  })

  await publishDockerPackageWithoutCi('a', '1.0.0')

  const master = await runCi({
    isMasterBuild: true,
  })
  expect(master.published.get('a')?.docker?.tags).toEqual(['1.0.0', '1.0.1', 'latest'])
  expect(master.published.get('a')?.docker?.latestTag).toEqual('1.0.1')
})

test(`run ci -> override all labels in registry with empty values -> run ci`, async () => {
  const { runCi, publishDockerPackageWithoutCi } = await createRepo({
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

  await publishDockerPackageWithoutCi('a', '1.0.1', {
    'latest-hash': '',
    'latest-tag': '',
  })

  const master = await runCi({
    isMasterBuild: true,
  })

  expect(master.published.get('a')?.docker?.tags).toEqual(['1.0.0', '1.0.1', '1.0.2', 'latest'])
  expect(master.published.get('a')?.docker?.latestTag).toEqual('1.0.2')
})

test(`run ci -> override all labels in registry with invalid values -> run ci and ensure we can recover from that`, async () => {
  const { runCi, publishDockerPackageWithoutCi } = await createRepo({
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

  await publishDockerPackageWithoutCi('a', '1.0.1', {
    'latest-hash': 'invalid-hash-$%^&',
    'latest-tag': 'invalid-tag-$%^&',
  })

  const master = await runCi({
    isMasterBuild: true,
  })

  expect(master.published.get('a')?.docker?.tags).toEqual(['1.0.0', '1.0.1', '1.0.2', 'latest'])
  expect(master.published.get('a')?.docker?.latestTag).toEqual('1.0.2')
})

test(`run ci -> override latest-hash label in registry with empty value -> run ci`, async () => {
  const { runCi, publishDockerPackageWithoutCi, addRandomFileToPackage } = await createRepo({
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

  await publishDockerPackageWithoutCi('a', '1.0.1', {
    'latest-hash': '',
  })

  await addRandomFileToPackage('a')

  const master = await runCi({
    isMasterBuild: true,
  })

  expect(master.published.get('a')?.docker?.tags).toEqual(['1.0.0', '1.0.1', '1.0.2', 'latest'])
  expect(master.published.get('a')?.docker?.latestTag).toEqual('1.0.2')
})

test(`run ci -> override latest-tag label in registry with empty value -> run ci`, async () => {
  const { runCi, publishDockerPackageWithoutCi, addRandomFileToPackage } = await createRepo({
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

  await publishDockerPackageWithoutCi('a', '1.0.1', {
    'latest-tag': '',
  })

  await addRandomFileToPackage('a')

  const master = await runCi({
    isMasterBuild: true,
  })

  expect(master.published.get('a')?.docker?.tags).toEqual(['1.0.0', '1.0.1', '1.0.2', 'latest'])
  expect(master.published.get('a')?.docker?.latestTag).toEqual('1.0.2')
})

test('run ci -> change packageJson.version to invalid version -> run ci', async () => {
  const { runCi, modifyPackageJson } = await createRepo({
    packages: [
      {
        name: 'a',
        version: '1.0.0',
        targetType: TargetType.docker,
      },
    ],
  })

  await modifyPackageJson('a', async packageJson => ({ ...packageJson, version: 'lalalal' }))

  await expect(
    runCi({
      isMasterBuild: true,
      stdio: 'pipe',
    }),
  ).rejects.toEqual(
    expect.objectContaining({
      stderr: expect.stringContaining('is invalid: lalalal'),
    }),
  )
})
