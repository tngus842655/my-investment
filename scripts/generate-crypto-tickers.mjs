/**
 * 암호화폐 티커명 자동 생성 스크립트
 *
 * 사용법: node scripts/generate-crypto-tickers.mjs
 *
 * 업비트 공개 API에서 KRW 마켓 전체 코인 목록을 가져와
 * src/utils/tickerNames.crypto.ts 의 CRYPTO_NAMES 섹션을 업데이트합니다.
 *
 * ※ API 키 불필요 (업비트 공개 API)
 */

import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function fetchUpbitMarkets() {
  console.log('📡 업비트 API에서 KRW 마켓 코인 목록 가져오는 중...')
  const res = await fetch('https://api.upbit.com/v1/market/all?isDetails=true', {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()

  // KRW 마켓만 필터링 (예: KRW-BTC → BTC)
  const krwMarkets = data.filter((m) => m.market.startsWith('KRW-'))
  console.log(`✅ KRW 마켓 ${krwMarkets.length}개 수집 완료`)
  return krwMarkets.map((m) => [m.market.replace('KRW-', ''), m.korean_name])
}

// 업비트 실패 시 빗썸 API로 폴백
async function fetchBithumbMarkets() {
  console.log('📡 빗썸 API로 재시도 중...')
  const res = await fetch('https://api.bithumb.com/public/ticker/ALL_KRW', {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data.status !== '0000') throw new Error('빗썸 응답 오류')

  // 빗썸은 한글명을 제공하지 않으므로 심볼만 반환 (한글명은 빈 문자열 → 그냥 심볼로 표시)
  const symbols = Object.keys(data.data).filter((k) => k !== 'date')
  console.log(`✅ 빗썸 ${symbols.length}개 수집 완료 (한글명 미제공)`)
  return symbols.map((s) => [s, s])
}

async function main() {
  let entries
  try {
    entries = await fetchUpbitMarkets()
  } catch (e) {
    console.warn(`⚠️  업비트 API 실패 (${e.message}), 빗썸으로 재시도...`)
    try {
      entries = await fetchBithumbMarkets()
    } catch (e2) {
      console.error('❌ 빗썸 API도 실패:', e2.message)
      process.exit(1)
    }
  }

  // 심볼 기준 정렬
  entries = entries.sort((a, b) => a[0].localeCompare(b[0]))

  const lines = [
    `// 이 파일은 scripts/generate-crypto-tickers.mjs 로 자동 생성됩니다.`,
    `// 업비트 KRW 마켓 기준 | 마지막 업데이트: ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `export const CRYPTO_NAMES: Record<string, string> = {`,
  ]
  for (const [symbol, name] of entries) {
    lines.push(`  '${symbol}': '${name.replace(/'/g, "\\'")}',`)
  }
  lines.push(`}`, ``)

  const targetPath = resolve(__dirname, '../src/utils/tickerNames.crypto.ts')
  writeFileSync(targetPath, lines.join('\n'), 'utf-8')

  console.log(`\n📝 업데이트 완료: src/utils/tickerNames.crypto.ts`)
  console.log(`   총 ${entries.length}개 코인 등록됨`)
  console.log(`\n💡 변경된 파일을 git commit 후 push 하면 반영됩니다.`)
}

main().catch((e) => {
  console.error('❌ 오류:', e.message)
  process.exit(1)
})
