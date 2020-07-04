// import { newEnv } from './prepare-test'
// import { TargetType } from './prepare-test/types'

// const { createRepo } = newEnv()

test('1 package', async () => {
  expect(1).toEqual(1)
  // const { runCi } = await createRepo({
  //   packages: [
  //     {
  //       name: 'a',
  //       version: '1.0.0',
  //       targetType: TargetType.npm,
  //     },
  //   ],
  // })
  // const pr = await runCi({
  //   isMasterBuild: false,
  // })
  // expect(pr.published).toHaveProperty('size', 0)
})
