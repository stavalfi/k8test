import bodyParser from 'body-parser'
import express from 'express'
import k8testLog from 'k8test-log'

const log = k8testLog('simple-server')

async function main() {
  log('starting simple-service')

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
    .get('/', (_req, res) => res.end('alive'))
    .listen(80, () => log('simple-service is listening on port 80'))
}

// eslint-disable-next-line no-floating-promise/no-floating-promise
main()
