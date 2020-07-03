import semver from 'semver'

export function getHighestDockerTag(tags: string[]): string | undefined {
  const sorted = semver.sort(tags.filter((tag: string) => semver.valid(tag)))
  if (sorted.length > 0) {
    return sorted[sorted.length - 1]
  }
}

export function calculateNewVersion({
  packagePath,
  packageJsonVersion,
  allVersions,
  latestPublishedVersion,
}: {
  packagePath: string
  packageJsonVersion: string
  latestPublishedVersion?: string
  allVersions?: string[]
}): string {
  if (!semver.valid(packageJsonVersion)) {
    throw new Error(`version packgeJson in ${packagePath} is invalid: ${packageJsonVersion}`)
  }
  const allValidVersions = allVersions?.filter(version => semver.valid(version))

  if (!allValidVersions?.length) {
    // this is immutable in each registry so if this is not defined or empty, it means that we never published before or there was unpublish of all the versions.
    return packageJsonVersion
  }

  const incVersion = (version: string) => {
    if (!semver.valid(version)) {
      throw new Error(`version is invalid: ${version} in ${packagePath}`)
    }
    const newVersion = semver.inc(version, 'patch')
    if (!newVersion) {
      throw new Error(`could not path-increment version: ${version} in ${packagePath}`)
    }
    return newVersion
  }

  if (!latestPublishedVersion) {
    // this is mutable in each registry so if we have versions but this is false, it means that:
    // a. this is the first run of the ci on a target that was already pbulished.
    // b. or, less likely, someone mutated one of the labels that this ci is modifying in every run :(

    if (allValidVersions.includes(packageJsonVersion)) {
      return incVersion(packageJsonVersion)
    } else {
      return packageJsonVersion
    }
  } else {
    if (allValidVersions.includes(latestPublishedVersion)) {
      const maxVersion = semver.gt(packageJsonVersion, latestPublishedVersion)
        ? packageJsonVersion
        : latestPublishedVersion

      if (allVersions?.includes(maxVersion)) {
        return incVersion(maxVersion)
      } else {
        return maxVersion
      }
    } else {
      const sorted = semver.sort(allValidVersions)

      return incVersion(sorted[sorted.length - 1])
    }
  }
}
