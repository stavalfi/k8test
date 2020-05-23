<h1 align="center">k8test</h1>
<p align="center">Easily Deploy images to local k8s in tests</p>

## Table of Contents

1. [Install](#install)
2. [Introduction](#introduction)
3. [Setup](#setup)
4. [Core Team](#core-team)

---

## Install

```bash
yarn add --dev k8test
```

## Introduction

Use all k8s features to deploy and expose images during tests.

#### Benefits

- Faster tests - deploying an image is slow. k8test deployments has a scope:
  - singletone in cluster (forever),
  - singletone is all tests-run (in the next test run, there will be new deployment)
  - not a singletone (each subscription will create new deployment)
- Monitoring tests resources - you can safly stop/cancel/shutdown the tests when/how ever you want and eventually all the resources will be deleted.
- There is no need to learn k8s. There are good defaults.

## Setup

From `packages/example-project`:

```javascript
// jest.config.js

module.exports = {
  globals: {
    // to make sure you will never use the same deployments from last tests
    APP_ID: k8test.randomAppId(),
  },
})
```

```typescript
// __tests__/globals.d.ts

declare const APP_ID: string
```

```typescript
// __tests__/utils.ts

import { baseSubscribe, NamespaceStrategy, Subscribe } from 'k8test'

export const subscribe: Subscribe = (imageName, options) =>
  baseSubscribe({
    imageName,
    appId: APP_ID,
    namespace: {
      namespaceStrategy: NamespaceStrategy.k8test,
    },
    ...options,
  })
```

```typescript
// __tests__/test.spec.ts

import Redis from 'ioredis'
import { Subscription } from 'k8test'
import { subscribe } from './utils'

describe('simple use-case', () => {
  let exposedRedisInfo: Subscription

  beforeEach(async () => {
    exposedRedisInfo = await subscribe('redis', {
      containerPortToExpose: 6379,
    })
  })

  afterEach(async () => {
    await exposedRedisInfo.unsubscribe() // redis will not be reachable after this line
  })

  test('ensure redis is alive', async () => {
    const redis = new Redis({
      host: exposedRedisInfo.deployedImageAddress,
      port: exposedRedisInfo.deployedImagePort,
    })
    await expect(redis.ping()).resolves.toEqual('PONG')
    redis.disconnect()
  })
})
```

## Api

```typescript
import { baseSubscribe, NamespaceStrategy, Subscribe } from 'k8test'

export const subscribe: Subscribe = (imageName, options) =>
  baseSubscribe({
    imageName,
    appId: APP_ID,
    namespace: {
      namespaceStrategy: NamespaceStrategy.k8test,
    },
    ...options,
  })

await subscribe('redis', {
  containerPortToExpose: 6379,
  isReadyPredicate: (url, host, port) => {
    const redis = new Redis({
      host,
      port,
      lazyConnect: true, // because i will try to connect manually in the next line
    })

    return redis.connect().finally(() => {
      try {
        redis.disconnect()
      } catch {
        // ignore error
      }
    })
  },
  singletoneStrategy: SingletoneStrategy.appId,
  ttlMs: 100_000_000,
})
```

## Debugging & Advanced Operstions

> How do I manually remove all the tests resources?

Depends on the namespace you chose to deploy all the tests resources to. it's its `k8test` namespace: `kubectl delete namesapce k8test`. That easy.

If it's a custom namesapce (or default), you will need to search for all the resources with the label `k8test=true` and delete them.

## Core Team

<table>
  <tbody>
    <tr>
      <td align="center" valign="top">
        <img width="150" height="150" src="https://github.com/stavalfi.png?s=150">
        <br>
        <a href="https://github.com/stavalfi">Stav Alfi</a>
        <p>Core</p>
        <br>
      </td>
     </tr>
  </tbody>
</table>
