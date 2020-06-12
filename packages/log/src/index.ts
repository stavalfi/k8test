import debug from 'debug'

export default debug

export function minimal(obj: any): object {
  const copy = { ...obj }
  delete copy.k8sClient
  return copy
}
