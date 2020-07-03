import { newEnv } from '../../prepare-test'
import { TargetType } from '../../prepare-test/types'

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
      stdio: 'pipe',
    }),
  ).rejects.toEqual(
    expect.objectContaining({
      stderr: expect.stringContaining('is invalid: lalalal'),
    }),
  )
})
