import debug from 'debug'

export default (namespace: string) => debug('k8test').extend(namespace)

export function minimal(obj: any): object {
  const copy = { ...obj }
  delete copy.k8sClient
  return copy
}
