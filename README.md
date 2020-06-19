<h1 align="center">k8test</h1>
<p align="center">Run docker images using k8s in tests</p>

## Table of Contents

1. [Install](#install)
2. [Introduction](#introduction)
3. [Setup](#setup)
4. [Api](#api)
5. [Supported OS](#supported-os)
6. [Run your tests in CI](#Run-your-tests-in-CI)
7. [Questions & Debugging & Advanced Operations](#Questions-&-Debugging-&-Advanced-Operations)
8. [Development & contributing](#Development-&-contributing)

---

## Install

```bash
yarn add --dev k8test
```

## Introduction

Use all k8s features to deploy and expose images during tests :heavy_check_mark:

### Benefits

- Faster tests - deploying an image is slow. k8test deployments added a scope property to the game:
  - a single deployment at most in a namespace (cluster),
  - in the next test run, there will be new deployment
  - each subscription will create new deployment
- [wip] Monitoring tests resources - you can safely stop/cancel/shutdown the tests when/how ever you want and eventually all the resources will be deleted.
- There is no need to learn k8s. There are very good defaults.

### No Surprises

- :surfer: No external synchronization is used (your file-system/network/...)
- :rocket: No pulling: Event based implementation: [kubernetes-client/javascript](https://github.com/kubernetes-client/javascript)

## Setup

Fast setup to deploy redis in your tests:

```json
{
  "name": "your-project",
  "scripts": {
    "pretest": "k8test start-monitoring",
    "test": "jest"
  },
  "devDependencies": {
    "k8test": "^1.0.0"
  }
}
```

- note: `k8test start-monitoring` - after the first run, it will take up to 1-2 seconds

```javascript
// jest.config.js
const k8test = require('k8test')

module.exports = {
  globals: {
    // to differentiate k8s resources between different runs
    APP_ID: k8test.randomAppId(),
  },
})
```

```typescript
// __tests__/test.spec.ts

import Redis from 'ioredis'
import { Subscription } from 'k8test'
import { subscribe } from './utils'
import { subscribe, Subscribe } from 'k8test'

describe('simple use-case', () => {
  let exposedRedisInfo: Subscription

  beforeEach(async () => {
    exposedRedisInfo = await subscribe({
      imageName: 'redis',
      imagePort: 6379,
    })
  })

  afterEach(async () => {
    await exposedRedisInfo.unsubscribe() // redis will not be reachable after this line
  })

  test('ensure redis is alive', async () => {
    const redis = new Redis({
      host: exposedRedisInfo.deployedImageAddress,
      port: exposedRedisInfo.deployedImagePort,
      connectTimeout: 1000,
    })
    await expect(redis.ping()).resolves.toEqual('PONG')
    redis.disconnect()
  })
})
```

## Api

```typescript
import { subscribe } from 'k8test'
import * as k8s from '@kubernetes/client-node' // you don't need to install it

export enum SingletonStrategy {
  manyInAppId = 'many-in-app-id',
  oneInNamespace = 'one-in-namespace',
  oneInAppId = 'one-in-app-id',
}

export type ContainerOptions = Omit<k8s.V1Container, 'name' | 'image' | 'ports'>

await subscribe({
  imageName: string
  postfix?: string
  appId?: string
  singletonStrategy?: SingletonStrategy
  imagePort: number
  containerOptions?: ContainerOptions  // for mounting and any other options
  namespaceName?: string
  isReadyPredicate?: (
    deployedImageUrl: string,
    deployedImageAddress: string,
    deployedImagePort: number,
  ) => Promise<unknown>
})
```

## Run your tests in CI

You should have k8s internal api exposed in your CI. it's very simple to set it up in Github-Actions: [Example](https://github.com/stavalfi/k8test/blob/master/.github/workflows/nodejs.yml):

```yaml
- name: install k8s
  uses: engineerd/setup-kind@v0.4.0
- run: yarn run your-tests
```

Thats it.

- I have a more advanced setup to test docker-images of other sub-packages of this repository.

## Supported OS

I'm developing on macOS Mojave and in CI we are running on linux debian

## Questions & Debugging & Advanced Operations

> How do I manually remove all the tests and k8test resources from my k8s cluster?

```bash
yarn k8test delete-k8test-resources
```

> How do I listen to stdout & stderr of a specific image?

work in progress. hold on. for now, you can manually search the container you need to attach to using kubectl cli, the app-id and namespace (which is k8test).

## Development & contributing

this library is in a early stage but it is functional. I don't have a draft for a better api to the end-users. Feel free to drastically change the api.

Keep in mind that tests are the first priority. production code can use this library but it has a lower level of priority.

PRs about Api/ speed improvement are welcome.

### Internal Tools

- secrethub
- skopeo
- yarn
- node 14
