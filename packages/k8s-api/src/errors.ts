export class NotFoundError extends Error {
  constructor(public readonly resourceName: string, public readonly resourceType: string) {
    super()
  }
}
