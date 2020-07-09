import { Request, Response } from 'express'
import { Subject } from 'rxjs'
import { ActiveToken, Db, MockedBet, MollyAccount, OpenedBetSlip } from './types'

export const OPENED_BET_SLIP_TTL = 60 * 1000
export const EXTEND_OPENED_BET_SLIP_TTL = 60 * 1000

export function initDb(): Db {
  return {
    mollyAccounts: new Set<MollyAccount>(),
    mockedBets: new Set<MockedBet>(),
    OpenedBetSlips: new Set<OpenedBetSlip>(),
    activeTokens: new Set<ActiveToken>(),
    newOpenBetSlip$: new Subject<OpenedBetSlip>(),
  }
}

export function authenticate(req: Request, res: Response, db: Db) {
  const token = req.header('Session')
  const username = [...db.activeTokens.keys()].find(activeToken => activeToken.token.data.token === token)?.mollyAccount
    ?.username

  if (!username) {
    res.status(401)
    res.send({
      status: 'error',
      code: 'token is invalid or empty',
    })
    return
  }
  return username
}
