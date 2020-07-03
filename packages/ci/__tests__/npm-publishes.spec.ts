import chance from 'chance'
import { newEnv } from './prepare-test'
import { TargetType } from './prepare-test/types'

const { createRepo } = newEnv()

test('1 package', async () => {
  const { runCi } = await createRepo({
    packages: [
      {
        name: 'a',
        version: '1.0.0',
        targetType: TargetType.npm,
      },
    ],
  })

  const master = await runCi({
    isMasterBuild: true,
  })
  expect(master.published.get('a')?.npm?.versions).toEqual(['1.0.0'])
})

test('multiple publishes of the same package', async () => {
  const { runCi, addRandomFileToPackage } = await createRepo({
    packages: [
      {
        name: 'a',
        version: '1.0.0',
        targetType: TargetType.npm,
      },
    ],
  })

  const master1 = await runCi({
    isMasterBuild: true,
  })
  expect(master1.published.get('a')?.npm?.versions).toEqual(['1.0.0'])

  await addRandomFileToPackage('a')

  const master2 = await runCi({
    isMasterBuild: true,
  })
  expect(master2.published.get('a')?.npm?.versions).toEqual(['1.0.0', '1.0.1'])
  expect(master2.published.get('a')?.npm?.latestVersion).toEqual('1.0.1')

  await addRandomFileToPackage('a')

  const master3 = await runCi({
    isMasterBuild: true,
  })
  expect(master3.published.get('a')?.npm?.versions).toEqual(['1.0.0', '1.0.1', '1.0.2'])
  expect(master3.published.get('a')?.npm?.latestVersion).toEqual('1.0.2')
})

test('multiple packages', async () => {
  const { runCi } = await createRepo({
    packages: [
      {
        name: 'a',
        version: '1.0.0',
        targetType: TargetType.npm,
      },
      {
        name: 'b',
        version: '2.0.0',
        targetType: TargetType.npm,
      },
      {
        name: 'c',
        version: '3.0.0',
        targetType: TargetType.npm,
      },
    ],
  })

  const master = await runCi({
    isMasterBuild: true,
  })
  expect(master.published.get('a')?.npm?.versions).toEqual(['1.0.0'])
  expect(master.published.get('b')?.npm?.versions).toEqual(['2.0.0'])
  expect(master.published.get('c')?.npm?.versions).toEqual(['3.0.0'])
})

test('multiple packages - all publish again because of modification in root files', async () => {
  const { runCi, addRandomFileToRoot } = await createRepo({
    packages: [
      {
        name: 'a',
        version: '1.0.0',
        targetType: TargetType.npm,
      },
      {
        name: 'b',
        version: '2.0.0',
        targetType: TargetType.npm,
      },
    ],
  })

  const master1 = await runCi({
    isMasterBuild: true,
  })

  expect(master1.published.get('a')?.npm?.versions).toEqual(['1.0.0'])
  expect(master1.published.get('b')?.npm?.versions).toEqual(['2.0.0'])

  await addRandomFileToRoot()

  const master2 = await runCi({
    isMasterBuild: true,
  })

  expect(master2.published.get('a')?.npm?.versions).toEqual(['1.0.0', '1.0.1'])
  expect(master2.published.get('a')?.npm?.latestVersion).toEqual('1.0.1')
  expect(master2.published.get('b')?.npm?.versions).toEqual(['2.0.0', '2.0.1'])
  expect(master2.published.get('b')?.npm?.latestVersion).toEqual('2.0.1')
})

test('multiple packages - all publish again because of modification in each package', async () => {
  const { runCi, addRandomFileToPackage } = await createRepo({
    packages: [
      {
        name: 'a',
        version: '1.0.0',
        targetType: TargetType.npm,
      },
      {
        name: 'b',
        version: '2.0.0',
        targetType: TargetType.npm,
      },
    ],
  })

  const master1 = await runCi({
    isMasterBuild: true,
  })

  expect(master1.published.get('a')?.npm?.versions).toEqual(['1.0.0'])
  expect(master1.published.get('b')?.npm?.versions).toEqual(['2.0.0'])

  await addRandomFileToPackage('a')
  await addRandomFileToPackage('b')

  const master2 = await runCi({
    isMasterBuild: true,
  })

  expect(master2.published.get('a')?.npm?.versions).toEqual(['1.0.0', '1.0.1'])
  expect(master2.published.get('a')?.npm?.latestVersion).toEqual('1.0.1')
  expect(master2.published.get('b')?.npm?.versions).toEqual(['2.0.0', '2.0.1'])
  expect(master2.published.get('b')?.npm?.latestVersion).toEqual('2.0.1')
})

test('1 package - validate publish content', async () => {
  const hash = chance().hash()
  const { runCi, installAndRunNpmDependency } = await createRepo({
    packages: [
      {
        name: 'a',
        version: '1.0.0',
        targetType: TargetType.npm,
        'index.js': `console.log("${hash}")`,
      },
    ],
  })

  await runCi({
    isMasterBuild: true,
  })

  await expect(installAndRunNpmDependency('a')).resolves.toEqual(
    expect.objectContaining({
      stdout: expect.stringContaining(hash),
    }),
  )
})
