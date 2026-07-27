---
url: 'https://developers-apps-in-toss.toss.im/user-hash-key/migration.md'
description: 토스 로그인에서 사용자 식별키로 마이그레이션하는 방법을 안내해요.
---

# 토스 로그인 마이그레이션

**토스 로그인(`userKey`)** 을 사용하는 미니앱을 **사용자 식별키(`hash`)** 로 전환하는 방법을 안내해요.

이 문서를 따라 하면, 현재 토스 로그인을 쓰는 유저를 점진적으로 사용자 식별키로 매핑하고,\
모든 유저가 이전되면 토스 로그인 의존성을 완전히 제거할 수 있어요.

## 언제 이 가이드를 사용하나요?

* 기존에 토스 로그인 `userKey` 로 사용자 식별을 하고 있어요.
* 앞으로는 사용자 식별키 `hash`값을 표준 식별자로 쓰고 싶어요.

## 핵심 개념

* **사용자 식별키 hash**: [`getUserKeyForGame()`](/user-hash-key/develop.html#%EA%B2%8C%EC%9E%84-%EB%AF%B8%EB%8B%88%EC%95%B1) 호출로 발급되는 게임용 고유 식별자
* **토스 로그인 userKey**: 기존 토스 로그인 기반 사용자 식별자
* **매핑**: 동일 사용자의 `userKey` 와 `hash` 값을 1:1로 연결한 상태

::: tip 참고해 주세요
각 게임별로 `hash` 값은 달라요.
:::

## 전체 전환 흐름

1. 클라이언트에서 `getUserKeyForGame()` 으로 사용자 식별키 `hash` 값을 발급받아요.
2. `getIsTossLoginIntegratedService()` 으로 토스 로그인 연동 여부를 확인해요.
3. 파트너사 서버에 매핑 여부를 조회해요.
4. 매핑되지 않았다면 `appLogin()` 을 통해 토스 로그인을 진행하고, `hash` 값을 서버로 전송해요.
5. 서버에서 토스 로그인 `userKey` 와 사용자 식별키 `hash` 값을 매핑 테이블에 저장해요.
6. 이후에는 `hash` 값만으로 사용자를 식별할 수 있어요. 모든 유저가 매핑되면 토스 로그인 의존성을 제거하세요.

## 사전 구현이 필요한 API

파트너사는 아래 두 가지 API를 **직접 구현해야 해요.**\
이 API들은 앱인토스에서 제공하지 않으며, 아래 예시를 참고해 파트너사 서버에서 자체적으로 개발해 주세요.

* **매핑 여부 조회**
  * `POST /api/auth/migration/status`
  * **Req**: `{ hash: string }`
  * **Res**: `{ isMapped: boolean }`

* **매핑 생성**
  * `POST /api/auth/migration/link`
  * **Req**: `{ hash: string; authorizationCode: string; referrer?: string }`
  * **Res**: `{ success: true }`

***

## 클라이언트 구현 단계

### 1. SDK 가져오기

```tsx
import { getUserKeyForGame, getIsTossLoginIntegratedService, appLogin } from '@apps-in-toss/web-framework';
```

### 2. 게임 hash 값 발급

```tsx
const result = await getUserKeyForGame();
if (!result) return console.warn('지원하지 않는 앱 버전이에요.');
if (result === 'INVALID_CATEGORY') return console.error('게임 카테고리가 아닌 미니앱이에요.');
if (result === 'ERROR') return console.error('사용자 키 조회 중 오류가 발생했어요.');
if (result.type !== 'HASH') return console.error('알 수 없는 반환값이에요.');
const { hash } = result;
```

### 3. 토스 로그인 연동 여부 확인

```tsx
const status = await getIsTossLoginIntegratedService();
if (status === 'INVALID_CLIENT') {
  console.log('토스 로그인이 연동되어 있지 않은 미니앱이에요.');
  return;
}
```

자세한 API 명세는 아래 [`getIsTossLoginIntegratedService`](#%ED%86%A0%EC%8A%A4-%EB%A1%9C%EA%B7%B8%EC%9D%B8-%EC%97%B0%EB%8F%99-%EC%97%AC%EB%B6%80-%ED%99%95%EC%9D%B8%ED%95%98%EA%B8%B0) 섹션을 참고해 주세요.

### 4. 파트너사 서버에 매핑 여부 조회 및 매핑

```tsx
if (status === true) {
  // 토스 로그인 연동된 유저
  const { isMapped } = await fetch('/api/auth/migration/status', {
    // 매핑 여부 확인
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hash }),
  }).then((r) => r.json());

  if (!isMapped) {
    const { authorizationCode, referrer } = await appLogin(); // 미매핑이면 토스 로그인 후 매핑 생성
    await fetch('/api/auth/migration/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorizationCode, referrer, hash }),
    });
  }

  console.log('매핑 완료 또는 이미 매핑된 사용자예요.');
  return;
}

console.log('토스 로그인 미연동 사용자예요.'); // status === false
```

### 5. 사용자 식별키 hash 사용

이제 사용자 식별은 사용자 식별키 `hash`값을 기준으로 하면 돼요.\
토스 로그인 `userKey` 대신, `getUserKeyForGame()` 으로 발급받은 사용자 식별키 `hash`값을 서버와 클라이언트 모두에서 사용자 식별자로 사용해 주세요.

***

## 전체 예시 코드

```tsx
import { getUserKeyForGame, getIsTossLoginIntegratedService, appLogin } from '@apps-in-toss/web-framework';

async function migrateIfNeeded() {
  const res = await getUserKeyForGame();
  if (!res) return console.warn('지원하지 않는 앱 버전이에요.');
  if (res === 'INVALID_CATEGORY') return console.error('게임 카테고리가 아닌 미니앱이에요.');
  if (res === 'ERROR') return console.error('사용자 키 조회 중 오류가 발생했어요.');
  if (res.type !== 'HASH') return console.error('알 수 없는 반환값이에요.');
  const { hash } = res;

  let status: boolean;
  try {
    status = await getIsTossLoginIntegratedService();
  } catch (error: any) {
    console.error('토스 로그인 연동 여부 확인 중 오류 발생:', error);
    return;
  }

  if (status === true) {
    // 매핑 여부 조회
    const { isMapped } = await fetch('/api/auth/migration/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash }),
    }).then((r) => r.json());

    if (!isMapped) {
      // 미매핑이면 토스 로그인 후 매핑 생성
      const { authorizationCode, referrer } = await appLogin();

      await fetch('/api/auth/migration/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorizationCode, referrer, hash }),
      });
    }

    console.log('매핑 완료 또는 이미 매핑된 사용자예요.');
    return;
  }

  // status === false : 토스 로그인 기능은 있으나 현재 유저는 미연동
  console.log('토스 로그인 미연동 사용자예요.');
}
```

::: tip 예외 처리

토스 로그인을 사용하지 않는 미니앱에서 `getIsTossLoginIntegratedService()`를 호출하면 아래 예외가 발생할 수 있어요.

```tsx
@throw {message: "oauth2ClientId 설정이 필요합니다."}
```

이 경우 토스 로그인 기능이 없는 환경이므로 별도 처리가 필요하지 않아요.
:::

***

## 토스 로그인 연동 여부 확인하기

**SDK 함수:** `getIsTossLoginIntegratedService`

`getIsTossLoginIntegratedService`는 **현재 유저가 토스 로그인과 연동된 유저인지 여부를 확인하는 API**예요.

이 함수는 주로 **토스 로그인 → 사용자 식별키 발급으로 마이그레이션하는 과정**에서 사용돼요.\
기존 토스 로그인 유저인지 여부에 따라, 로그인 플로우나 데이터 이전 처리를 분기할 때 활용할 수 있어요.

**시그니처**

```tsx
function getIsTossLoginIntegratedService(): Promise<boolean>;
```

| 반환 타입          | 설명                                                                           |
| ------------------ | ------------------------------------------------------------------------------ |
| `Promise<boolean>` | 현재 서비스가 토스 로그인과 연동되어 있다면 `true`, 아니면 `false`를 반환해요. |

### 주의사항

* 이 API는 토스 로그인 기능을 사용하는(또는 사용했던) 미니앱에서만 의미가 있어요.
* 토스 로그인을 전혀 사용하지 않는 미니앱에서 호출하면 아래와 같은 예외가 발생할 수 있어요.

```tsx
@throw { message: 'oauth2ClientId 설정이 필요합니다.' }
```

**예제 : 토스 로그인 연동 여부 확인하기**

아래 예제는 유저가 토스 로그인 연동 유저인지 확인한 뒤, 상태에 따라 서로 다른 처리를 하는 기본적인 흐름을 보여줘요.

::: code-group

```js [js]
import { getIsTossLoginIntegratedService } from '@apps-in-toss/web-framework';

async function handleGetIsTossLoginIntegratedService() {
  try {
    const result = await getIsTossLoginIntegratedService();

    if (result === undefined) {
      console.warn('지원하지 않는 앱 버전이에요.');
      return;
    }
    if (result === true) {
      console.log('토스 로그인이 연동된 유저에요.');
      // 여기에서 토스 로그인 연동 유저에 대한 처리를 할 수 있어요.
    }
    if (result === false) {
      console.log('토스 로그인이 연동되지 않은 유저에요.');
      // 여기에서 토스 로그인 연동 유저가 아닌 경우에 대한 처리를 할 수 있어요.
    }
  } catch (error) {
    console.error(error);
  }
}
```

```tsx [React]
import { getIsTossLoginIntegratedService } from '@apps-in-toss/web-framework';

function GetIsTossLoginIntegratedServiceButton() {
  async function handleClick() {
    try {
      const result = await getIsTossLoginIntegratedService();

      if (result === undefined) {
        console.warn('지원하지 않는 앱 버전이에요.');
        return;
      }
      if (result === true) {
        console.log('토스 로그인이 연동된 유저에요.');
        // 여기에서 토스 로그인 연동 유저에 대한 처리를 할 수 있어요.
      }
      if (result === false) {
        console.log('토스 로그인이 연동되지 않은 유저에요.');
        // 여기에서 토스 로그인 연동 유저가 아닌 경우에 대한 처리를 할 수 있어요.
      }
    } catch (error) {
      console.error(error);
    }
  }

  return <button onClick={handleClick}>토스 로그인 통합 서비스 여부 확인</button>;
}
```

```tsx [React Native]
import { Button } from 'react-native';
import { getIsTossLoginIntegratedService } from '@apps-in-toss/framework';

function GetIsTossLoginIntegratedServiceButton() {
  async function handlePress() {
    try {
      const result = await getIsTossLoginIntegratedService();

      if (result === undefined) {
        console.warn('지원하지 않는 앱 버전이에요.');
        return;
      }
      if (result === true) {
        console.log('토스 로그인이 연동된 유저에요.');
        // 여기에서 토스 로그인 연동 유저에 대한 처리를 할 수 있어요.
      }
      if (result === false) {
        console.log('토스 로그인이 연동되지 않은 유저에요.');
        // 여기에서 토스 로그인 연동 유저가 아닌 경우에 대한 처리를 할 수 있어요.
      }
    } catch (error) {
      console.error(error);
    }
  }

  return <Button onPress={handlePress} title="토스 로그인 통합 서비스 여부 확인" />;
}
```

:::

### 언제 사용하면 좋을까요?

* 토스 로그인 기반 서비스에서 **사용자 식별키로 전환(마이그레이션)** 할 때
* 기존 유저와 신규 유저를 구분해 **데이터 이전/보상 처리**를 해야 할 때
* 토스 로그인 연동 여부에 따라 **서로 다른 UX를 제공**해야 할 때

### 참고사항

* `getIsTossLoginIntegratedService`는 마이그레이션 보조 API예요.
* 인증/로그인 기능은 아래를 참고해 주세요.
  * [토스 로그인](/login/develop.html)
  * [사용자 식별키 발급](/user-hash-key/develop.html)
