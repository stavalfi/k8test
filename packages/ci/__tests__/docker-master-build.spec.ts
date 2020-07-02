import chance from 'chance'
import { newEnv, runDockerImage } from './prepare-test'
import { TargetType } from './prepare-test/types'

const { createRepo } = newEnv()

test('1 package', async () => {
  const { runCi } = await createRepo({
    packages: [
      {
        name: 'a',
        version: '1.0.0',
        targetType: TargetType.docker,
      },
    ],
  })

  const master = await runCi({
    isMasterBuild: true,
  })
  expect(master.published.get('a')?.docker?.tags).toEqual(['1.0.0', 'latest'])
  expect(master.published.get('a')?.docker?.latestTag).toEqual('1.0.0')
})

test('ensure the image is working', async () => {
  const hash = chance().hash()
  const { runCi, dockerRegistry, dockerOrganizationName, toActualName } = await createRepo({
    packages: [
      {
        name: 'a',
        version: '1.0.0',
        targetType: TargetType.docker,
        additionalFiles: {
          Dockerfile: `FROM alpine
          CMD ["echo","${hash}"]`,
        },
      },
    ],
  })

  await runCi({
    isMasterBuild: true,
  })

  await expect(
    runDockerImage(
      `${dockerRegistry.host}:${dockerRegistry.port}/${dockerOrganizationName}/${toActualName('a')}:1.0.0`,
    ),
  ).resolves.toEqual(
    expect.objectContaining({
      stdout: expect.stringContaining(hash),
    }),
  )
})
