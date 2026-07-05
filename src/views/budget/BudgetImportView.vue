<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { formatCurrency } from '@/utils/numberFormat'
import { DEFAULT_BUDGET_CATEGORIES } from '@/utils/budgetDefaultCategories'
import type { BudgetType, BudgetCategory, BudgetPaymentMethod } from '@/types/budget'

const router = useRouter()

interface ParsedRow {
  rowNumber: number
  entryDate: string | null
  paymentMethodName: string
  categoryName: string
  memo: string
  amount: number | null
  type: BudgetType | null
  error: string | null
}

const fileInput = ref<HTMLInputElement | null>(null)
const fileName = ref('')
const parsing = ref(false)
const importing = ref(false)
const parsedRows = ref<ParsedRow[]>([])

const validRows = computed(() => parsedRows.value.filter((r) => !r.error))
const errorRows = computed(() => parsedRows.value.filter((r) => r.error))

const newCategoryNames = computed(() => {
  const seen = new Set<string>()
  const list: { type: BudgetType; name: string }[] = []
  for (const r of validRows.value) {
    const key = `${r.type}:${r.categoryName}`
    if (seen.has(key)) continue
    seen.add(key)
    list.push({ type: r.type as BudgetType, name: r.categoryName })
  }
  return list
})

const newPaymentMethodNames = computed(() => {
  const seen = new Set<string>()
  const list: string[] = []
  for (const r of validRows.value) {
    if (!r.paymentMethodName || seen.has(r.paymentMethodName)) continue
    seen.add(r.paymentMethodName)
    list.push(r.paymentMethodName)
  }
  return list
})

const cellToString = (v: unknown): string => {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>
    if (typeof obj.text === 'string') return obj.text
    if (Array.isArray(obj.richText)) {
      return (obj.richText as { text: string }[]).map((t) => t.text).join('')
    }
    if ('result' in obj) return String(obj.result)
  }
  return String(v)
}

const parseDateCell = (v: unknown): string | null => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = cellToString(v)
  const m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  if (!m) return null
  const [, y, mo, d] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

const parseAmountCell = (v: unknown): number | null => {
  if (typeof v === 'number') return Math.round(v)
  const s = cellToString(v).replace(/[^0-9.-]/g, '')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n) : null
}

const parseTypeCell = (v: unknown): BudgetType | null => {
  const s = cellToString(v).trim()
  if (s === '지출') return 'EXPENSE'
  if (s === '수입') return 'INCOME'
  return null
}

const cleanCategoryName = (v: unknown): string =>
  cellToString(v).replace(/^[^\p{L}\p{N}]+/u, '').trim()

const resetResult = () => {
  parsedRows.value = []
  fileName.value = ''
}

const onFileChange = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  resetResult()
  fileName.value = file.name
  parsing.value = true
  try {
    const { default: ExcelJS } = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await file.arrayBuffer())
    const sheet = workbook.worksheets[0]
    if (!sheet) {
      showMessage('시트를 찾을 수 없습니다.', 'error')
      return
    }

    const rows: ParsedRow[] = []
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return // 헤더 행 skip

      const dateRaw = row.getCell(1).value
      const assetRaw = row.getCell(2).value
      const categoryRaw = row.getCell(3).value
      const memoRaw = row.getCell(4).value
      const amountRaw = row.getCell(5).value
      const typeRaw = row.getCell(6).value

      // 완전히 빈 행은 건너뜀
      if (![dateRaw, assetRaw, categoryRaw, memoRaw, amountRaw, typeRaw].some((v) => v != null && cellToString(v).trim() !== '')) {
        return
      }

      const entryDate = parseDateCell(dateRaw)
      const amount = parseAmountCell(amountRaw)
      const type = parseTypeCell(typeRaw)
      const categoryName = cleanCategoryName(categoryRaw)
      const paymentMethodName = cellToString(assetRaw).trim()
      const memo = cellToString(memoRaw).trim()

      let error: string | null = null
      if (!entryDate) error = '날짜 형식을 확인해주세요'
      else if (!type) error = '수입/지출 구분을 확인해주세요'
      else if (!categoryName) error = '카테고리가 비어있습니다'
      else if (amount === null || amount <= 0) error = '금액을 확인해주세요'

      rows.push({ rowNumber, entryDate, paymentMethodName, categoryName, memo, amount, type, error })
    })

    parsedRows.value = rows
    if (rows.length === 0) {
      showMessage('가져올 내역이 없습니다.', 'warning')
    }
  } catch {
    showMessage('엑셀 파일을 읽는 중 오류가 발생했습니다.', 'error')
    resetResult()
  } finally {
    parsing.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

const triggerFileSelect = () => {
  fileInput.value?.click()
}

const doImport = async () => {
  if (validRows.value.length === 0) return
  importing.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: catData }, { data: pmData }] = await Promise.all([
      supabase.from('budget_categories').select('*').eq('user_id', user.id),
      supabase.from('budget_payment_methods').select('*').eq('user_id', user.id),
    ])
    const categories = (catData ?? []) as BudgetCategory[]
    const paymentMethods = (pmData ?? []) as BudgetPaymentMethod[]

    // ── 누락된 카테고리 생성 ──────────────────────────
    const categoryTypeCounts: Record<BudgetType, number> = {
      EXPENSE: categories.filter((c) => c.type === 'EXPENSE').length,
      INCOME: categories.filter((c) => c.type === 'INCOME').length,
    }
    const missingCategories = newCategoryNames.value.filter(
      (n) => !categories.some((c) => c.type === n.type && c.name === n.name),
    )
    if (missingCategories.length > 0) {
      const rows = missingCategories.map((n) => {
        const preset = DEFAULT_BUDGET_CATEGORIES.find((d) => d.type === n.type && d.name === n.name)
        const sortOrder = categoryTypeCounts[n.type]++
        return { user_id: user.id, type: n.type, name: n.name, icon: preset?.icon ?? '🧾', sort_order: sortOrder }
      })
      const { data: inserted, error } = await supabase.from('budget_categories').insert(rows).select()
      if (error) throw error
      categories.push(...((inserted ?? []) as BudgetCategory[]))
    }

    // ── 누락된 결제수단 생성 ──────────────────────────
    let pmSortOrder = paymentMethods.length
    const missingPaymentMethods = newPaymentMethodNames.value.filter(
      (name) => !paymentMethods.some((p) => p.name === name),
    )
    if (missingPaymentMethods.length > 0) {
      const rows = missingPaymentMethods.map((name) => ({ user_id: user.id, name, sort_order: pmSortOrder++ }))
      const { data: inserted, error } = await supabase.from('budget_payment_methods').insert(rows).select()
      if (error) throw error
      paymentMethods.push(...((inserted ?? []) as BudgetPaymentMethod[]))
    }

    // ── 내역 등록 ──────────────────────────
    const entries = validRows.value.map((r) => {
      const category = categories.find((c) => c.type === r.type && c.name === r.categoryName)
      const paymentMethod = r.paymentMethodName
        ? paymentMethods.find((p) => p.name === r.paymentMethodName)
        : null
      return {
        user_id: user.id,
        category_id: category!.id,
        type: r.type,
        amount: r.amount,
        payment_method_id: paymentMethod?.id ?? null,
        memo: r.memo || null,
        entry_date: r.entryDate,
      }
    })

    const CHUNK_SIZE = 500
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const chunk = entries.slice(i, i + CHUNK_SIZE)
      const { error } = await supabase.from('budget_entries').insert(chunk)
      if (error) throw error
    }

    showMessage(`${entries.length}건의 내역을 가져왔습니다.`, 'success')
    resetResult()
  } catch {
    showMessage('가져오기 중 오류가 발생했습니다.', 'error')
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <v-container class="pa-4 pa-sm-6 pb-16">
    <div class="d-flex align-center ga-3 mb-6">
      <button class="back-btn" @click="router.back()">
        <v-icon size="20">mdi-arrow-left</v-icon>
      </button>
      <div>
        <div class="font-weight-bold">엑셀 가져오기</div>
        <div class="text-medium-emphasis">엑셀 파일로 과거 내역 일괄 등록</div>
      </div>
    </div>

    <div class="glass-card pa-4 mb-4">
      <div class="format-title mb-2">엑셀 양식 안내</div>
      <div class="text-medium-emphasis" style="font-size: 0.8125rem">
        1행은 제목 행이며, 2행부터 데이터를 읽습니다. 열 순서: <b>날짜 · 자산(결제수단) · 카테고리 · 내용 · 금액(원) · 수입/지출</b>
      </div>
    </div>

    <input ref="fileInput" type="file" accept=".xlsx,.xls" class="d-none" @change="onFileChange" />
    <v-btn
      block
      color="primary"
      variant="tonal"
      rounded="lg"
      prepend-icon="mdi-file-upload-outline"
      :loading="parsing"
      @click="triggerFileSelect"
    >
      {{ fileName || '엑셀 파일 선택' }}
    </v-btn>

    <template v-if="parsedRows.length > 0">
      <div class="d-flex ga-2 mt-4 mb-3">
        <div class="summary-chip">총 {{ parsedRows.length }}건</div>
        <div class="summary-chip summary-chip-ok">정상 {{ validRows.length }}건</div>
        <div v-if="errorRows.length > 0" class="summary-chip summary-chip-error">오류 {{ errorRows.length }}건</div>
      </div>

      <div v-if="newCategoryNames.length > 0 || newPaymentMethodNames.length > 0" class="glass-card pa-3 mb-3">
        <div v-if="newCategoryNames.length > 0" class="mb-1" style="font-size: 0.8125rem">
          <b>새 카테고리</b>: {{ newCategoryNames.map((c) => c.name).join(', ') }}
        </div>
        <div v-if="newPaymentMethodNames.length > 0" style="font-size: 0.8125rem">
          <b>새 결제수단</b>: {{ newPaymentMethodNames.join(', ') }}
        </div>
      </div>

      <div class="glass-card preview-list mb-4">
        <div
          v-for="r in parsedRows"
          :key="r.rowNumber"
          class="preview-row"
          :class="{ 'preview-row-error': r.error }"
        >
          <template v-if="r.error">
            <div class="preview-error-text">{{ r.rowNumber }}행: {{ r.error }}</div>
          </template>
          <template v-else>
            <div class="preview-main">
              <div class="preview-date">{{ r.entryDate }}</div>
              <div class="preview-category">{{ r.categoryName }}<span v-if="r.memo"> · {{ r.memo }}</span></div>
            </div>
            <div :class="r.type === 'INCOME' ? 'income-color' : 'expense-color'">
              {{ formatCurrency(r.amount ?? 0) }}원
            </div>
          </template>
        </div>
      </div>

      <v-btn
        block
        color="primary"
        rounded="lg"
        :disabled="validRows.length === 0"
        :loading="importing"
        @click="doImport"
      >
        {{ validRows.length }}건 가져오기
      </v-btn>
    </template>
  </v-container>
</template>

<style scoped>
.back-btn {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s;
}
.back-btn:active { opacity: 0.6; }

.glass-card {
  background: var(--fp-surface);
  border: 1px solid var(--fp-outline);
  border-radius: 20px;
}

.format-title {
  font-weight: 700;
  font-size: 0.875rem;
}

.summary-chip {
  padding: 4px 12px;
  border-radius: 20px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  font-size: 0.75rem;
  font-weight: 600;
}
.summary-chip-ok {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
}
.summary-chip-error {
  color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.1);
}

.preview-list {
  max-height: 420px;
  overflow-y: auto;
}

.preview-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.05);
  font-size: 0.8125rem;
}
.preview-row:last-child {
  border-bottom: none;
}
.preview-row-error {
  background: rgba(var(--v-theme-error), 0.06);
}
.preview-error-text {
  color: rgb(var(--v-theme-error));
  font-size: 0.75rem;
}

.preview-main {
  min-width: 0;
}
.preview-date {
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
}
.preview-category {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.income-color { color: rgb(var(--v-theme-primary)); }
.expense-color { color: rgb(var(--v-theme-error)); }
</style>
