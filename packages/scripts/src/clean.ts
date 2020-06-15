/* eslint-disable no-console */
import glob from 'fast-glob'
import fs from 'fs-extra'
import path from 'path'

const BASE_PATH = path.join(__dirname, '../..')
const GLOBS_TO_REMOVE = ['dist', '*.tsbuildinfo', '*.d.ts', 'yarn-error.log'].map(entry => `**/${entry}`)

const remove = (
  options: ({ onlyFiles: true } | { onlyDirectories: true }) & { beforeRemove: (toRemove: string) => void },
) =>
  glob(GLOBS_TO_REMOVE, {
    cwd: BASE_PATH,
    ignore: ['node_modules', '.git'],
    ...options,
  }).then(results =>
    Promise.all(
      results.map(async toRemove => {
        options.beforeRemove(toRemove)
        await fs.remove(path.join(BASE_PATH, toRemove))
      }),
    ).then(() => results),
  )

export async function clean(options: { silent: boolean }) {
  const log = options.silent
    ? () => {
        // ignore
      }
    : console.log.bind(console)
  log(`removing globs: ${GLOBS_TO_REMOVE.join(', ')}`)
  log(`from: ${BASE_PATH}`)
  log('-------------------')

  const dirs = await remove({
    onlyDirectories: true,
    beforeRemove: toRemove => log(`dir: ${toRemove}`),
  })
  const files = await remove({ onlyFiles: true, beforeRemove: toRemove => log(`file: ${toRemove}`) })
  log('------summary------')

  log(`${dirs.length} directories removed`)
  log(`${files.length} files removed`)
}
