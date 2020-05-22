export const generateString = (appId: string, imageName: string, { postfix }: { postfix: string }) =>
  `${appId}-${imageName.replace('/', '-')}-${postfix}`

const isResourceAlreadyExistError = (e: any) => e?.response?.statusCode === 409 && e?.body?.reason === 'AlreadyExists'

export const ignoreAlreadyExistError = (dontFailIfExist?: boolean) => (e: any) => {
  if (isResourceAlreadyExistError(e)) {
    if (!dontFailIfExist) {
      throw e
    }
  }
}
