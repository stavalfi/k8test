/* eslint-disable no-console */
import bodyParser from 'body-parser'
import chance from 'chance'
import express from 'express'
import http from 'http'
import queryString from 'query-string'
import { of } from 'rxjs'
import { concatMap, filter, tap } from 'rxjs/operators'
import WebSocket from 'ws'
import {
  ActiveToken,
  MockedBet,
  MollyAccount,
  MollyOpenBetSlipRequest,
  MollyOpenBetSlipResponse,
  MollyPlaceOrderResponse,
  MollySocketDataMessage,
  OpenedBetSlip,
  OrderReqBody,
  Token,
} from './types'
import { initDb, authenticate, OPENED_BET_SLIP_TTL, EXTEND_OPENED_BET_SLIP_TTL } from './utils'

async function main() {
  console.log('starting molly-mock')

  let db = initDb()

  const app = express()
    .use(bodyParser.json())
    .post('/reset-mock', (req, res) => {
      db = initDb()
    })
    .post<{}, unknown, MockedBet>('/set-mock-event', (req, res) => {
      // all data that i will send in the web-socket
      const bet = [...db.mockedBets.keys()].find(
        bet1 =>
          bet1.betId.bet_type === req.body.betId.bet_type &&
          bet1.betId.event_id === req.body.betId.event_id &&
          bet1.betId.sport === req.body.betId.sport,
      )
      if (bet) {
        bet.mockedEvents = req.body.mockedEvents
      } else {
        db.mockedBets.add(req.body)
      }

      res.end()
    })
    // open bit-slip
    .post<{}, MollyOpenBetSlipResponse, MollyOpenBetSlipRequest>('/v1/betslips/', (req, res) => {
      const username = authenticate(req, res, db)

      if (!username) {
        return
      }

      const openBetSlip = [...db.OpenedBetSlips.keys()].find(
        bet1 =>
          bet1.betId.bet_type === req.body.bet_type &&
          bet1.betId.event_id === req.body.event_id &&
          bet1.betId.sport === req.body.sport,
      )

      if (openBetSlip) {
        // todo: need to check if molly throw error or approve this
        return res.json(openBetSlip.mockedBet.openBetSlipResponse)
      }

      const mockedBet = [...db.mockedBets.keys()].find(
        bet1 =>
          bet1.betId.bet_type === req.body.bet_type &&
          bet1.betId.event_id === req.body.event_id &&
          bet1.betId.sport === req.body.sport,
      )

      if (!mockedBet) {
        res.status(401)
        res.send({
          status: 'error',
          code: 'bet does not exist',
        })
        return
      }

      if (mockedBet.openBetSlipResponse.status === 'ok') {
        const openedBetSlip: OpenedBetSlip = {
          betId: req.body,
          mockedBet,
          username,
          mollyBetSlipId: mockedBet.openBetSlipResponse.data.betslip_id,
          startDate: new Date(),
          ttlInMs: OPENED_BET_SLIP_TTL,
        }

        db.OpenedBetSlips.add(openedBetSlip)

        res.json(mockedBet.openBetSlipResponse)

        db.newOpenBetSlip$.next(openedBetSlip) // if no one subscribe to this observable, this event will never be used (I think that this is how molly behaves)
      } else {
        res.status(400)
        res.json(mockedBet.openBetSlipResponse)
      }
    })
    // keep-alive
    .get('/v1/xrates/', (req, res) => {
      // ...
    })
    // Get open bet Slips at Molly
    .get('/v1/betslips/', (req, res) => {
      // todo: placing manager is not using it so i don't implement it yet
      res.status(501)
      res.end()
    })
    // extend bet-slip
    .post<{ mollyBetSlipId: string }>('/v1/betslips/:mollyBetSlipId/refresh/', (req, res) => {
      const username = authenticate(req, res, db)

      if (!username) {
        return
      }

      const mollyBetSlipId = req.params.mollyBetSlipId

      const openBetSlip = [...db.OpenedBetSlips.keys()].find(bet1 => bet1.mollyBetSlipId === mollyBetSlipId)

      if (!openBetSlip) {
        res.status(401)
        res.send({
          status: 'error',
          code: `mollyBetSlipId: ${mollyBetSlipId} doesn't exist`,
        })
        return
      }

      openBetSlip.ttlInMs += EXTEND_OPENED_BET_SLIP_TTL

      res.end()
    })
    // place bet
    .post<{}, MollyPlaceOrderResponse, OrderReqBody>('/v1/orders/', (req, res) => {
      res.status(501)
      res.end()
    })
    // request for token to open bet-slip socket
    .post<{}, Token, MollyAccount>('/v1/sessions/', (req, res) => {
      const isAccountFound = [...db.mollyAccounts.keys()].some(
        account => account.username === req.body.username && account.password === req.body.password,
      )
      if (!isAccountFound) {
        res.status(401)
        return
      }

      const activeToken: ActiveToken = {
        mollyAccount: {
          username: req.body.username,
          password: req.body.password,
        },
        token: {
          data: {
            token: chance().hash(),
          },
        },
      }
      db.activeTokens.add(activeToken)
      res.json(activeToken.token)
    })
    .get('/', (_req, res) => res.end('alive'))

  const server = http.createServer(app)

  const wss = new WebSocket.Server({ server, path: '/v1stream' })

  wss.on('connection', async function connection(ws, req) {
    const send = (data: string): Promise<void> =>
      new Promise((res, rej) => ws.send(data, error => (error ? rej(error) : res())))

    // need to check that the end of the path is: ?token=${this.token}

    // ws.send: JSON.strigify of:
    interface MollyAsyncMsgEnvelope {
      ts: number
      data: MollySocketDataMessage[]
    }

    const {
      query: { token },
    } = queryString.parseUrl(req.url || '')

    const username = [...db.activeTokens.keys()].find(activeToken => activeToken.token.data.token === token)
      ?.mollyAccount?.username

    if (!username) {
      await send('token is missing or invalid')
      return ws.close()
    }

    const { unsubscribe } = db.newOpenBetSlip$
      .pipe(
        filter(openedBetSlip => openedBetSlip.username === username),
        filter(openedBetSlip => {
          const endDate = new Date(openedBetSlip.startDate)
          endDate.setMilliseconds(endDate.getMilliseconds() + openedBetSlip.ttlInMs)
          return new Date() < endDate
        }),
        concatMap(openedBetSlip => {
          const x$ = of(openedBetSlip.mockedBet.mockedEvents).pipe(
            tap(mockedEvent =>
              console.log(
                `mollyBetSlipId: "${openedBetSlip.mollyBetSlipId}" sent event to ${username}: ${JSON.stringify(
                  mockedEvent,
                  null,
                  2,
                )}`,
              ),
            ),
            concatMap(mockedEvent => send(JSON.stringify(mockedEvent))),
          )
          return x$
        }),
      )
      .subscribe({
        next: () => {
          // nothing to do here
        },
      })

    ws.onclose = () => unsubscribe()
  })

  server.listen(80, () => {
    console.log('molly-mock service is listening on port 80')

    const wsClient = new WebSocket('ws://localhost:80/v1stream?token=123', {
      perMessageDeflate: false,
    })

    wsClient.on('message', function incoming(data) {
      console.log(data)
    })
  })
}

if (require.main === module) {
  // eslint-disable-next-line no-floating-promise/no-floating-promise
  main()
}
