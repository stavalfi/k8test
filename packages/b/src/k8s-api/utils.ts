export const generateString = (appId: string, imageName: string, { postfix }: { postfix: string }) =>
  `${appId}-${imageName.replace('/', '-')}-${postfix}`
