/**
 * 국내 주식/ETF 티커명 자동 생성 스크립트
 *
 * 사용법: node scripts/generate-kr-tickers.mjs
 *
 * 네이버 금융에서 KOSPI/KOSDAQ 전체 종목 + ETF 목록을 가져와
 * src/utils/tickerNames.kr.ts 를 업데이트합니다.
 * - KR_STOCK_NAMES: KOSPI + KOSDAQ 일반 종목
 * - KR_ETF_NAMES:   국내 ETF 전체
 *
 * ※ 로컬 PC에서 실행해야 합니다 (외부 API 접근 필요)
 */

import { writeFileSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  Referer: 'https://finance.naver.com/',
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function fetchEucKr(url) {
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  const buf = await res.arrayBuffer()
  return new TextDecoder('euc-kr').decode(buf)
}

// ─── 주식 (KOSPI / KOSDAQ) ───────────────────────────────────────────────────

async function getStockTotalPages(sosok) {
  const text = await fetchEucKr(
    `https://finance.naver.com/sise/sise_market_sum.naver?sosok=${sosok}&page=1`
  )
  const match = text.match(/pgRR[^>]*page=(\d+)/)
  return match ? parseInt(match[1]) : 50
}

async function fetchStockPage(sosok, page) {
  const text = await fetchEucKr(
    `https://finance.naver.com/sise/sise_market_sum.naver?sosok=${sosok}&page=${page}`
  )
  const stocks = []
  const regex = /href="\/item\/main\.naver\?code=(\d{6})"[^>]*>([^<]+)<\/a>/g
  let m
  while ((m = regex.exec(text)) !== null) {
    const code = m[1], name = m[2].trim()
    if (code && name) stocks.push({ code, name })
  }
  return stocks
}

async function fetchAllStocks(sosok) {
  const label = sosok === 0 ? 'KOSPI' : 'KOSDAQ'
  const totalPages = await getStockTotalPages(sosok)
  console.log(`  ${label}: 총 ${totalPages}페이지 수집 중...`)

  const map = new Map()
  for (let page = 1; page <= totalPages; page++) {
    try {
      const stocks = await fetchStockPage(sosok, page)
      for (const { code, name } of stocks) {
        if (!map.has(code)) map.set(code, name)
      }
      if (page % 10 === 0) {
        process.stdout.write(`    ${page}/${totalPages} 페이지 완료\n`)
        await delay(300)
      }
    } catch (e) {
      console.warn(`    페이지 ${page} 실패: ${e.message}`)
    }
  }
  console.log(`  ${label}: ${map.size}개 수집 완료`)
  return map
}

// ─── ETF ────────────────────────────────────────────────────────────────────

// 방법 1: 네이버 ETF JSON API (한 번에 전체 목록) — UTF-8 응답
async function fetchEtfsFromApi() {
  const url = 'https://finance.naver.com/api/sise/etfItemList.nhn'
  const res = await fetch(url, { headers: { ...HEADERS, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  // Content-Type 확인 후 인코딩 처리
  const contentType = res.headers.get('content-type') ?? ''
  let json
  if (contentType.includes('euc-kr') || contentType.includes('EUC-KR')) {
    // EUC-KR로 내려오는 경우 직접 디코딩 후 파싱
    const buf = await res.arrayBuffer()
    const text = new TextDecoder('euc-kr').decode(buf)
    json = JSON.parse(text)
  } else {
    json = await res.json()
  }

  // 응답 구조: { result: { etfItemList: [ { itemcode, itemname, ... } ] } }
  const list = json?.result?.etfItemList ?? []
  if (list.length === 0) throw new Error('etfItemList가 비어 있음')
  const map = new Map()
  for (const item of list) {
    const code = item.itemcode ?? item.itemCode
    const name = (item.itemname ?? item.itemName ?? '').trim()
    if (code && name) map.set(String(code), name)
  }
  return map
}

// 방법 2: 네이버 ETF 시세 페이지 스크래핑 (API 실패 시 폴백)
async function fetchEtfsFromHtml() {
  const map = new Map()
  // ETF 시세 목록: sise_etf.naver (페이지네이션 없이 전체 출력)
  const urls = [
    'https://finance.naver.com/etf/etfList.naver',
    'https://finance.naver.com/etf/etfList.naver?etfType=0',
    'https://finance.naver.com/etf/etfList.naver?etfType=1',
  ]
  for (const url of urls) {
    try {
      const text = await fetchEucKr(url)
      const regex = /href="\/etf\/detail\.naver\?code=([A-Za-z0-9]{6})"[^>]*>([^<]+)<\/a>/g
      let m
      while ((m = regex.exec(text)) !== null) {
        const code = m[1], name = m[2].trim()
        if (code && name && !map.has(code)) map.set(code, name)
      }
      await delay(300)
    } catch (e) {
      console.warn(`    HTML 폴백 실패 (${url}): ${e.message}`)
    }
  }
  return map
}

async function fetchAllEtfs() {
  console.log('  ETF: JSON API로 수집 시도...')
  try {
    const map = await fetchEtfsFromApi()
    if (map.size > 0) {
      console.log(`  ETF: ${map.size}개 수집 완료 (API)`)
      return map
    }
    throw new Error('API 응답이 비어 있음')
  } catch (e) {
    console.warn(`  ETF API 실패, HTML 폴백 시도: ${e.message}`)
    const map = await fetchEtfsFromHtml()
    console.log(`  ETF: ${map.size}개 수집 완료 (HTML)`)
    return map
  }
}

// ─── 파일 쓰기 ───────────────────────────────────────────────────────────────

function buildSection(exportName, map) {
  const sorted = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const lines = [`export const ${exportName}: Record<string, string> = {`]
  for (const [code, name] of sorted) {
    lines.push(`  '${code}': '${name.replace(/'/g, "\\'")}',`)
  }
  lines.push(`}`)
  return lines.join('\n')
}

// ─── 메인 ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📡 네이버 금융에서 종목 데이터 가져오는 중...\n')

  console.log('[ 주식 ]')
  let kospiMap, kosdaqMap
  try {
    kospiMap = await fetchAllStocks(0)
    kosdaqMap = await fetchAllStocks(1)
  } catch (e) {
    console.error('❌ 주식 수집 실패:', e.message)
    process.exit(1)
  }
  const stockMap = new Map([...kospiMap, ...kosdaqMap])

  console.log('\n[ ETF ]')
  let etfMap
  try {
    etfMap = await fetchAllEtfs()
  } catch (e) {
    console.error('❌ ETF 수집 실패:', e.message)
    process.exit(1)
  }

  // 주식 Map에서 ETF 코드 제거 (중복 방지 — ETF는 ETF 섹션에만)
  for (const code of etfMap.keys()) {
    stockMap.delete(code)
  }

  console.log(`\n✅ 주식 ${stockMap.size}개 + ETF ${etfMap.size}개`)

  const targetPath = resolve(__dirname, '../src/utils/tickerNames.kr.ts')

  const output = [
    `// 이 파일은 scripts/generate-kr-tickers.mjs 로 자동 생성됩니다.`,
    `// 마지막 업데이트: ${new Date().toISOString().slice(0, 10)}`,
    ``,
    buildSection('KR_STOCK_NAMES', stockMap),
    ``,
    buildSection('KR_ETF_NAMES', etfMap),
    ``,
  ].join('\n')

  writeFileSync(targetPath, output, 'utf-8')
  console.log(`\n📝 업데이트 완료: src/utils/tickerNames.kr.ts`)
  console.log(`\n💡 변경된 파일을 git commit 후 push 하면 반영됩니다.`)
}

main().catch((e) => {
  console.error('❌ 오류:', e.message)
  process.exit(1)
})
