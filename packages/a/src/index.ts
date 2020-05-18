#!/usr/bin/env YARN_SILENT=1 yarn ts-node

import { command, option, run, Type } from 'cmd-ts'
import fs from 'fs-extra'

const Env: Type<string, {}> = {
  from(str) {
    return Object.fromEntries(str.split(',').map(keyValue => keyValue.split('=')))
  },
  defaultValue() {
    return {}
  },
}

const Cwd: Type<string, string> = {
  async from(location) {
    //@ts-ignore
    if (await fs.exists(location)) {
      if ((await fs.lstat(location)).isDirectory()) {
        return location
      } else {
        throw new Error(`location: "${location}" is a file and not a directory`)
      }
    } else {
      throw new Error(`location: "${location}" doesn't exist`)
    }
  },
  defaultValue() {
    return process.cwd()
  },
}

const app = command({
  name: 'test',
  args: {
    env: option({
      type: Env,
      long: 'env',
    }),
    cwd: option({
      type: Cwd,
      long: 'cwd',
    }),
  },
  handler: options => {
    console.log(options)
  },
})

run(app, process.argv.slice(2))

async function f1(options: { env: {}; cwd: string }) {}
