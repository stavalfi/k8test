export type Labels = { [key: string]: string }

export enum ExposeStrategy {
  insideCluster = 'insideCluster',
  userMachine = 'userMachine',
}

export enum SubscriptionOperation {
  subscribe = 'subscribe',
  unsubscribe = 'unsubscribe',
}
