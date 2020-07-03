import { newEnv } from './prepare-test'
import { TargetType } from './prepare-test/types'

const { createRepo } = newEnv()

test('multiple publishes of the same package but packages has no changes in between', async () => {
  const { runCi } = await createRepo({
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

  // const master2 = await runCi({
  //   isMasterBuild: true,
  // })
  // expect(master2.published.get('a')?.npm?.versions).toEqual(['1.0.0'])
})

test('multiple packages - publish again only changed package', async () => {
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

  const master2 = await runCi({
    isMasterBuild: true,
  })

  expect(master2.published.get('a')?.npm?.versions).toEqual(['1.0.0', '1.0.1'])
  expect(master2.published.get('a')?.npm?.latestVersion).toEqual('1.0.1')
  expect(master1.published.get('b')?.npm?.versions).toEqual(['2.0.0'])
})
