import chance from 'chance'
import { SubscribeCreator as BaseSubscribe } from './types'

export { Subscribe, Namespace, NamespaceStrategy, Subscription } from './types'

export const baseSubscribe: BaseSubscribe = async options => {
  return {
    exposedUrl: 'http://1.2.3.4:8080',
    exposedAddress: 'localhost',
    exposedPort: 8080,
    unsubscribe: () => Promise.resolve(),
  }
}

export const randomAppId = () => `app-id-${chance().hash()}`
