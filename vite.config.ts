import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

import { cloudflare } from "@cloudflare/vite-plugin";

const ALLOWED_SCRIPTS: Record<string, string> = {
  'generate-kr-tickers': 'scripts/generate-kr-tickers.mjs',
  'generate-crypto-tickers': 'scripts/generate-crypto-tickers.mjs',
}

// 티커 파일에서 특정 export 블록을 파싱해 Map으로 반환
function parseTickers(filePath: string, exportName: string): Map<string, string> {
  const content = readFileSync(filePath, 'utf-8')
  const match = content.match(new RegExp(`export const ${exportName}[^{]*\\{([\\s\\S]*?)\\n\\}`))
  if (!match) return new Map()
  const map = new Map<string, string>()
  for (const m of match[1].matchAll(/'?(\w+)'?:\s*'([^']+)'/g)) {
    map.set(m[1], m[2])
  }
  return map
}

// Map을 티커 파일의 특정 export 블록에 덮어씀 (나머지 블록 유지)
function writeTickers(filePath: string, exportName: string, map: Map<string, string>) {
  const content = readFileSync(filePath, 'utf-8')
  const sorted = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const block = [
    `export const ${exportName}: Record<string, string> = {`,
    ...sorted.map(([k, v]) => `  ${k}: '${v.replace(/'/g, "\\'")}',`),
    `}`,
  ].join('\n')
  const replaced = content.replace(
    new RegExp(`export const ${exportName}[^{]*\\{[\\s\\S]*?\\n\\}`),
    block,
  )
  writeFileSync(filePath, replaced, 'utf-8')
}

function readBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk: any) => { body += chunk })
    req.on('end', () => resolve(JSON.parse(body || '{}')))
  })
}

function adminPlugin(): Plugin {
  const usFilePath = resolve(process.cwd(), 'src/utils/tickerNames.us.ts')

  return {
    name: 'admin-plugin',
    apply: 'serve',
    configureServer(server) {
      // 스크립트 실행 (SSE 스트리밍)
      server.middlewares.use('/api/admin/run-script', (req, res) => {
        if (req.method !== 'POST') { res.writeHead(405).end(); return }
        let body = ''
        req.on('data', (chunk: any) => { body += chunk })
        req.on('end', () => {
          const { script } = JSON.parse(body || '{}')
          const scriptPath = ALLOWED_SCRIPTS[script]
          if (!scriptPath) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: '허용되지 않은 스크립트입니다.' }))
            return
          }
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
          const child = spawn('node', [scriptPath], { cwd: process.cwd() })
          const send = (data: string) => res.write(`data: ${JSON.stringify(data)}\n\n`)
          child.stdout.on('data', (d: any) => send(d.toString()))
          child.stderr.on('data', (d: any) => send(d.toString()))
          child.on('close', (code: number) => {
            send(`\n✅ 완료 (exit ${code})`)
            res.write('event: done\ndata: {}\n\n')
            res.end()
          })
        })
      })

      // 미국 주식 티커 목록 조회
      server.middlewares.use('/api/admin/tickers', async (req, res) => {
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'GET') {
          const map = parseTickers(usFilePath, 'US_STOCK_NAMES')
          const list = [...map.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([ticker, name]) => ({ ticker, name }))
          res.end(JSON.stringify(list))
          return
        }

        const body = await readBody(req)

        if (req.method === 'POST') {
          const { ticker, name } = body
          if (!ticker || !name) { res.writeHead(400).end(JSON.stringify({ error: '티커와 이름을 입력하세요.' })); return }
          const map = parseTickers(usFilePath, 'US_STOCK_NAMES')
          map.set(ticker.toUpperCase().trim(), name.trim())
          writeTickers(usFilePath, 'US_STOCK_NAMES', map)
          res.end(JSON.stringify({ ok: true }))
          return
        }

        if (req.method === 'DELETE') {
          const { ticker } = body
          if (!ticker) { res.writeHead(400).end(); return }
          const map = parseTickers(usFilePath, 'US_STOCK_NAMES')
          map.delete(ticker.toUpperCase().trim())
          writeTickers(usFilePath, 'US_STOCK_NAMES', map)
          res.end(JSON.stringify({ ok: true }))
          return
        }

        res.writeHead(405).end()
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), vueDevTools(), adminPlugin(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['icons/*.png'],
    manifest: {
      name: 'FirePath',
      short_name: 'FirePath',
      description: '나만의 FIRE 목표 관리 플랫폼',
      theme_color: '#0E8A82',
      background_color: '#F0F7F6',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/dashboard',
      icons: [
        {
          src: '/icons/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: '/icons/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
        },
        {
          src: '/icons/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
  }), cloudflare()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3820,
  },
})