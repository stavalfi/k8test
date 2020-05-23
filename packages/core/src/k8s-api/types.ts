export type Labels = { [key: string]: string }

export enum ExposeStrategy {
  insideCluster = 'insideCluster',
  userMachine = 'userMachine',
}
