import { Subject } from 'rxjs'

export type MollyPrice = (string | number)[]

export interface InvalidAccounts {
  [key: string]: { [key: string]: string }
}

export interface Account {
  username: string
  bet_type: string
  bookie: string
}

export interface MollyOpenBetSlipRequest {
  sport: string
  event_id: string
  bet_type: string
}

export interface MollyBetSlipData {
  betslip_id: string
  sport: string
  event_id: string
  bet_type: string
  equivalent_bets: boolean
  multiple_accounts: boolean
  is_open: boolean
  expiry_ts: number
  bookies_with_offers: string[]
  equivalent_bets_bookies: MollyPrice
  close_reason: string
  customer_username: string
  customer_ccy: string
  invalid_accounts: InvalidAccounts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  want_bookies?: any
  accounts: Account[]
}

export interface EventInfo {
  event_id: string
  home_id: number
  home_team: string
  away_id: number
  away_team: string
  competition_id: number
  competition_name: string
  competition_country: string
  start_time: Date
  date: string
}

export interface MollyAsyncEventPayloadOrder {
  order_id: string
  order_type: string
  bet_type: string
  bet_type_description: string
  bet_type_template: string
  sport: string
  placer: string
  want_price: number
  want_stake: MollyPrice
  ccy_rate: number
  placement_time: Date
  expiry_time: Date
  closed: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  close_reason?: any
  status: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user_data?: any
  take_starting_price: boolean
  keep_open_ir: boolean
  event_info: EventInfo
  price: number
  stake: MollyPrice
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profit_loss?: any
}

interface Status {
  code: string
}

export interface MollyAsyncEventPayloadBet {
  bet_id: string
  order_id: string
  sport: string
  event_id: string
  bookie: string
  username: string
  bet_type: string
  ccy_rate: number
  reconciled: boolean
  bookie_bet_id: string
  status: Status
  want_price: number
  got_price: number
  want_stake: MollyPrice
  got_stake: MollyPrice
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profit_loss?: any
}
export interface MollyAsyncEventPayloadOrderClosed {
  order_id: string
  close_reason: string
}

interface Effective {
  price: number
  min: (number | string)[]
  max: (number | string)[]
}

interface Pricelist {
  effective: Effective
  bookie: Effective
}

export interface MollyAsyncEventPayloadPmm {
  betslip_id: string
  sport: string
  event_id: string
  bookie: string
  username: string
  bet_type: string
  price_list: Pricelist[]
  status: Status
}

export enum EventName {
  event = 'event',
  sync = 'sync',
  xrate = 'xrate',
  balance = 'balance',
  info = 'info',
  removeEvent = 'remove_event',
  orderClosed = 'order_closed',
  order = 'order',
  bet = 'bet',
  betslip = 'betslip',
  betslipClosed = 'betslip_closed',
  pmm = 'pmm',
}

export type SupportedEventPayload =
  | MollyAsyncEventPayloadOrderClosed
  | MollyAsyncEventPayloadOrder
  | MollyAsyncEventPayloadBet
  | MollyBetSlipData
  | MollyAsyncEventPayloadPmm

export type MollySocketDataMessage =
  | [EventName.event, unknown]
  | [EventName.sync, unknown]
  | [EventName.xrate, unknown]
  | [EventName.balance, unknown]
  | [EventName.info, unknown]
  | [EventName.removeEvent, unknown]
  | [EventName.orderClosed, MollyAsyncEventPayloadOrderClosed]
  | [EventName.order, MollyAsyncEventPayloadOrder]
  | [EventName.bet, MollyAsyncEventPayloadBet]
  | [EventName.betslip, MollyBetSlipData] // updates about a bet_slip that we subscribed to
  | [EventName.betslipClosed, MollyAsyncEventPayloadOrderClosed]
  | [EventName.pmm, MollyAsyncEventPayloadPmm]

export type MockedBet = {
  betId: MollyOpenBetSlipRequest
  mockedEvents: MollySocketDataMessage[]
  openBetSlipResponse: MollyOpenBetSlipResponse
}

export interface MollyAccount {
  username: string
  password: string
}

export interface Token {
  data: {
    token: string
  }
}
export type ActiveToken = {
  mollyAccount: MollyAccount
  token: Token
}

export interface MollyOpenBetSlipRequest {
  sport: string
  event_id: string
  bet_type: string
}

export type MollyOpenBetSlipResponse =
  | {
      status: 'ok'
      data: MollyBetSlipData
    }
  | {
      status: 'error'
      code: string
    }

export type Username = string

export type OpenedBetSlip = {
  mollyBetSlipId: string
  username: Username
  betId: MollyOpenBetSlipRequest
  mockedBet: MockedBet
  startDate: Date
  ttlInMs: number
}

export type Db = {
  mollyAccounts: Set<MollyAccount>
  mockedBets: Set<MockedBet>
  OpenedBetSlips: Set<OpenedBetSlip>
  activeTokens: Set<ActiveToken>
  newOpenBetSlip$: Subject<OpenedBetSlip>
}

export interface OrderReqBody {
  betslip_id: string
  price: number
  stake: [number, number]
}

export interface MollyPlaceOrderResponse {
  status: string
  data: MollyAsyncEventPayloadOrder
  /*
      data:
        status: ok
        data:
          net_profit_loss:      null
          placement_time:       2020-03-13T15:54:07.205643+00:00
          user_data:            null
          bet_type_template:    {home} -0.5/1 (Asian)
          bet_type:             for,ah,h,-3
          sport:                fb
          want_stake:
            - USD
            - 2
          expiry_time:          2020-03-13T15:54:22.205643+00:00
          order_type:           normal
          net_price:            null
          event_info:
            competition_id:      13
            home_team:           DSC Arminia Bielefeld
            away_team:           VfL Osnabrück
            away_id:             958
            event_id:            2020-03-13,204,958
            start_time:          2020-03-13T17:30:00+00:00
            competition_country: DE
            competition_name:    Germany Bundesliga 2
            home_id:             204
            date:                2020-03-13
          net_stake:            null
          closed:               false
          status:               open
          keep_open_ir:         false
          order_id:             89093174
          want_price:           2.01
          ccy_rate:             1.245718
          detailed_price:       null
          close_reason:         null
          placer:               Placing
          bet_type_description: DSC Arminia Bielefeld -0.5/1 (Asian)
          take_starting_price:  false
          detailed_profit_loss: null
          detailed_stake:       null

      */
}
