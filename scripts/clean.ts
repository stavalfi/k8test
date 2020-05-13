// remove all typescript/other tools complication outputs

/* eslint-disable no-console */
import fs from 'fs-extra'
import path from 'path'
import glob from 'fast-glob'

const BASE_PATH = path.join(__dirname, '..')
const GLOBS_TO_REMOVE = ['dist', '*.tsbuildinfo', '*.d.ts', 'yarn-error.log'].map(entry => `**/${entry}`)

const remove = (options: { onlyFiles: true } | { onlyDirectories: true }) =>
  glob(GLOBS_TO_REMOVE, {
    cwd: BASE_PATH,
    ignore: ['node_modules', '.git'],
    ...options,
  }).then(results =>
    Promise.all(
      results.map(toRemove => {
        console.log('onlyFiles' in options ? `file: ${toRemove}` : `dir: ${toRemove}`)
        return fs.remove(path.join(BASE_PATH, toRemove))
      }),
    ).then(() => results),
  )

async function main() {
  console.log(`removing globs: ${GLOBS_TO_REMOVE.join(', ')}`)
  console.log(`from: ${BASE_PATH}`)
  console.log('-------------------')

  const dirs = await remove({ onlyDirectories: true })
  const files = await remove({ onlyFiles: true })
  console.log('------summary------')

  console.log(`${dirs.length} directories removed`)
  console.log(`${files.length} files removed`)
}

main()
