import chance from 'chance'
import { SubscribeCreator as BaseSubscribe } from './types'

export { Subscribe, Namespace, NamespaceStrategy, Subscription } from './types'

export const baseSubscribe: BaseSubscribe = async options => {
  return {
    getDeployedImageUrl: async () => 'http://localhost:8080',
    getDeployedImageAddress: async () => 'localhost',
    getDeployedImagePort: async () => 8080,
    unsubscribe: () => Promise.resolve(),
  }
}

export const randomAppId = () => `app-id-${chance().hash()}`
