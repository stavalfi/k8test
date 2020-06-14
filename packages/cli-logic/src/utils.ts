export async function waitUntilReady(isReadyPredicate: () => Promise<unknown>): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await isReadyPredicate()
      return
    } catch (e) {
      await new Promise(res => setTimeout(res, 1000))
    }
  }
}
