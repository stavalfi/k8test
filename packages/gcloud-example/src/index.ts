/* eslint-disable no-console */

import bodyParser from 'body-parser'
import express from 'express'

async function main() {
  process.on('unhandledRejection', e => console.error(e))

  console.log('starting gcloud-example')

  const map = new Map<string, unknown>()

  express()
    .use(bodyParser.json())
    .post('/set', (req, res) => {
      Object.entries(req.query).forEach(([key, value]) => map.set(key, value))
      res.end()
    })
    .get('/get/:key', (req, res) => {
      const key = req.params.key
      res.end(map.get(key))
    })
    .get('/is-alive', (_req, res) => res.end('true'))
    .get('/', (_req, res) => res.end('alive\nversion=10.0.0'))
    .listen(80, () => console.log('gcloud-example is listening on port 80'))
}

// eslint-disable-next-line no-floating-promise/no-floating-promise
main()
