export async function waitUntilReady(isReadyPredicate: () => Promise<unknown>): Promise<void> {
  let i = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // eslint-disable-next-line no-console
      console.log(`try ${i}`)
      await isReadyPredicate()
      return
    } catch (e) {
      await new Promise(res => setTimeout(res, 1000))
    }
    i++
  }
}
