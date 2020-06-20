import { PackageInfo, TargetType } from './types'

export function shouldPromote(packageInfo: PackageInfo): boolean {
  return packageInfo.targets.some(target => {
    switch (target.targetType) {
      case TargetType.npm:
        return !target.npm.isAlreadyPublished
      case TargetType.docker:
        return !target.docker.isAlreadyPublished
    }
  })
}

export function shouldPublish(packageInfo: PackageInfo): boolean {
  return shouldPromote(packageInfo)
}
