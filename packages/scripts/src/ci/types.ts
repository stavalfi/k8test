export type PackageJson = {
  name: string
  version: string
  dependencies?: { [key: string]: string }
  devDependencies?: { [key: string]: string }
}

export type PackageInfo = {
  packagePath: string
  packageHash: string
  packageJson: PackageJson
  npm?: {
    isAlreadyPublished: boolean
    latestVersion?: { version: string; hash: string }
  }
  docker?: {
    isAlreadyPublished: boolean
    latestTag?: { tag: string; hash: string }
  }
}

export type Node<T> = {
  data: T
  parentsIndexes: number[]
  childrenIndexes: number[]
}

export type Graph<T> = Node<T>[]
