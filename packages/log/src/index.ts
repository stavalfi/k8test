import debug from 'debug'

export default (namespace: string) => debug('k8test').extend(namespace)

export function minimal(obj: any): object {
  const copy = { ...obj }
  delete copy.k8sClient
  delete copy.watchClient
  delete copy.podStdio
  if (obj.podStdio) {
    copy.podsStdio = {
      stdout: obj.podStdio.stdout === process.stdout ? 'testProcessStdout' : 'custom-endpoint',
      stderr: obj.podStdio.stderr === process.stderr ? 'testProcessStderr' : 'custom-endpoint',
    }
  }
  return copy
}
