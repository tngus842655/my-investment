/**
 * 국내 주식 티커명 자동 생성 스크립트
 *
 * 사용법: node scripts/generate-kr-tickers.mjs
 *
 * 네이버 금융에서 KOSPI/KOSDAQ 전체 종목을 가져와
 * src/utils/tickerNames.kr.ts 의 KR_STOCK_NAMES 섹션을 업데이트합니다.
 * ETF 섹션(KR_ETF_NAMES)은 건드리지 않습니다.
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

// 네이버 금융 시세 페이지에서 종목코드+이름 파싱
// sosok: 0=KOSPI, 1=KOSDAQ
async function fetchNaverPage(sosok, page) {
  const url = `https://finance.naver.com/sise/sise_market_sum.naver?sosok=${sosok}&page=${page}`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const arrayBuffer = await res.arrayBuffer()
  const text = new TextDecoder('euc-kr').decode(arrayBuffer)

  const stocks = []
  // 종목 링크: /item/main.naver?code=005930
  const regex = /href="\/item\/main\.naver\?code=(\d{6})"[^>]*>([^<]+)<\/a>/g
  let match
  while ((match = regex.exec(text)) !== null) {
    const code = match[1]
    const name = match[2].trim()
    if (code && name) stocks.push({ code, name })
  }
  return stocks
}

// 전체 페이지 수 파악
async function getTotalPages(sosok) {
  const url = `https://finance.naver.com/sise/sise_market_sum.naver?sosok=${sosok}&page=1`
  const res = await fetch(url, { headers: HEADERS })
  const arrayBuffer = await res.arrayBuffer()
  const text = new TextDecoder('euc-kr').decode(arrayBuffer)

  // pgRR(마지막 페이지 링크)에서 총 페이지 수 추출
  const match = text.match(/pgRR[^>]*page=(\d+)/)
  return match ? parseInt(match[1]) : 50
}

async function fetchAllStocks(sosok) {
  const label = sosok === 0 ? 'KOSPI' : 'KOSDAQ'
  const totalPages = await getTotalPages(sosok)
  console.log(`  ${label}: 총 ${totalPages}페이지 수집 중...`)

  const map = new Map()
  for (let page = 1; page <= totalPages; page++) {
    try {
      const stocks = await fetchNaverPage(sosok, page)
      for (const { code, name } of stocks) {
        if (!map.has(code)) map.set(code, name)
      }
      // 과도한 요청 방지
      if (page % 10 === 0) {
        process.stdout.write(`    ${page}/${totalPages} 페이지 완료\n`)
        await new Promise(r => setTimeout(r, 300))
      }
    } catch (e) {
      console.log(`    페이지 ${page} 실패: ${e.message}`)
    }
  }
  console.log(`  ${label}: ${map.size}개 수집 완료`)
  return map
}

async function main() {
  console.log('📡 네이버 금융에서 종목 데이터 가져오는 중...')

  let kospiMap, kosdaqMap
  try {
    kospiMap = await fetchAllStocks(0)
    kosdaqMap = await fetchAllStocks(1)
  } catch (e) {
    console.error('❌ 실패:', e.message)
    process.exit(1)
  }

  const symbolMap = new Map([...kospiMap, ...kosdaqMap])
  const sorted = [...symbolMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  console.log(`✅ 총 ${sorted.length}개`)

  const targetPath = resolve(__dirname, '../src/utils/tickerNames.kr.ts')
  const existing = readFileSync(targetPath, 'utf-8')
  const etfMatch = existing.match(/(export const KR_ETF_NAMES[\s\S]+)/)
  const etfSection = etfMatch
    ? etfMatch[1]
    : 'export const KR_ETF_NAMES: Record<string, string> = {}\n'

  const lines = [
    `// 이 파일은 scripts/generate-kr-tickers.mjs 로 자동 생성됩니다.`,
    `// 마지막 업데이트: ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `export const KR_STOCK_NAMES: Record<string, string> = {`,
  ]
  for (const [code, name] of sorted) {
    lines.push(`  '${code}': '${name.replace(/'/g, "\\'")}',`)
  }
  lines.push(`}`, ``, etfSection)

  writeFileSync(targetPath, lines.join('\n'), 'utf-8')
  console.log(`\n📝 업데이트 완료: src/utils/tickerNames.kr.ts`)
  console.log(`   (KR_ETF_NAMES 섹션은 유지됨)`)
  console.log(`\n💡 변경된 파일을 git commit 후 push 하면 반영됩니다.`)
}

main().catch((e) => {
  console.error('❌ 오류:', e.message)
  process.exit(1)
})
