<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/services/supabase'
import { showMessage } from '@/composables/useSnackbar'
import { formatBudgetAmount } from '@/utils/budgetMoney'
import { useBaseCurrency } from '@/composables/useBaseCurrency'
import { useUserDataStore } from '@/stores/userData'
import type { BudgetType, BudgetCategory, BudgetPaymentMethod } from '@/types/budget'

const router = useRouter()
const { t } = useI18n()
const { baseCurrency } = useBaseCurrency()
const userDataStore = useUserDataStore()

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

const existingCategories = ref<BudgetCategory[]>([])
const existingPaymentMethods = ref<BudgetPaymentMethod[]>([])

// 기본 카테고리("🍚 식비" 등)는 이모지 접두사가 붙어 있어, 엑셀에 이모지 없이
// "식비"라고만 적혀 있어도 같은 카테고리로 인식하도록 비교 시에만 선행 기호를 제거
const normalizeForMatch = (name: string) => name.replace(/^[^\p{L}\p{N}]+/u, '').trim().toLowerCase()

const fetchExisting = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const [{ data: catData }, { data: pmData }] = await Promise.all([
    supabase.from('budget_categories').select('*').eq('user_id', user.id),
    supabase.from('budget_payment_methods').select('*').eq('user_id', user.id),
  ])
  existingCategories.value = (catData ?? []) as BudgetCategory[]
  existingPaymentMethods.value = (pmData ?? []) as BudgetPaymentMethod[]
}

onMounted(fetchExisting)

const validRows = computed(() => parsedRows.value.filter((r) => !r.error))
const errorRows = computed(() => parsedRows.value.filter((r) => r.error))

const newCategoryNames = computed(() => {
  const seen = new Set<string>()
  const list: { type: BudgetType; name: string }[] = []
  for (const r of validRows.value) {
    const key = `${r.type}:${r.categoryName}`
    if (seen.has(key)) continue
    seen.add(key)
    const exists = existingCategories.value.some(
      (c) => c.type === r.type && normalizeForMatch(c.name) === normalizeForMatch(r.categoryName),
    )
    if (exists) continue
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
    const exists = existingPaymentMethods.value.some(
      (p) => normalizeForMatch(p.name) === normalizeForMatch(r.paymentMethodName),
    )
    if (exists) continue
    list.push(r.paymentMethodName)
  }
  return list
})

const cellToString = (v: unknown): string => {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

const parseDateCell = (v: unknown): string | null => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // read-excel-file은 엑셀 날짜를 UTC 자정 기준으로 반환하므로,
    // 로컬 타임존 getter를 쓰면 지역에 따라 날짜가 하루씩 밀릴 수 있어 UTC getter 사용
    const y = v.getUTCFullYear()
    const m = String(v.getUTCMonth() + 1).padStart(2, '0')
    const d = String(v.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = cellToString(v)
  const m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  if (!m) return null
  const y = m[1]!
  const mo = m[2]!
  const d = m[3]!
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
  const s = cellToString(v).trim().toLowerCase()
  if (s === '지출' || s === 'expense') return 'EXPENSE'
  if (s === '수입' || s === 'income') return 'INCOME'
  return null
}

const cleanCategoryName = (v: unknown): string => cellToString(v).trim()

const resetResult = () => {
  parsedRows.value = []
  fileName.value = ''
}

type ColumnKey = 'date' | 'asset' | 'category' | 'memo' | 'amount' | 'type'

const COLUMN_LABEL_KEYS: Record<ColumnKey, string> = {
  date: 'budget.import.colDate',
  asset: 'budget.import.colAsset',
  category: 'budget.import.colCategory',
  memo: 'budget.import.colMemo',
  amount: 'budget.import.colAmount',
  type: 'budget.import.colType',
}

// 화면 안내용 — 자산은 "자산(결제수단)"으로 더 풀어서 보여줌
const requiredColumnLabels = computed(() => [
  t('budget.import.colDate'),
  t('budget.import.colAssetFull'),
  t('budget.import.colCategory'),
  t('budget.import.colMemo'),
  t('budget.import.colAmount'),
  t('budget.import.colType'),
])

// 제목 행 문구가 조금 다르게 적혀 있어도(예: "결제수단", "금액") 인식되도록 별칭 허용.
// 한글/영문 별칭을 항상 함께 인식 — 로케일과 다른 언어 양식도 가져올 수 있게 (영문은 소문자 비교)
const COLUMN_ALIASES: Record<ColumnKey, string[]> = {
  date: ['날짜', '일자', 'date'],
  asset: ['자산', '결제수단', '자산(결제수단)', 'asset', 'payment method', 'asset (payment method)'],
  category: ['카테고리', '분류', 'category'],
  memo: ['내용', '메모', 'note', 'memo', 'description'],
  amount: ['금액(원)', '금액', 'amount', 'amount (krw)'],
  type: ['수입/지출', '수입지출', '구분', 'income/expense', 'type'],
}

// 제목 행 텍스트로 각 열이 실제로 몇 번째 칸에 있는지 찾음 (열 순서가 바뀌어도 정상 인식되도록)
const findColumnIndexes = (
  headerRow: unknown[],
): { indexes: Record<ColumnKey, number>; missing: ColumnKey[] } => {
  const headerCells = headerRow.map((v) => cellToString(v).trim().toLowerCase())
  const indexes = {} as Record<ColumnKey, number>
  const missing: ColumnKey[] = []
  for (const key of Object.keys(COLUMN_ALIASES) as ColumnKey[]) {
    const index = headerCells.findIndex((h) => COLUMN_ALIASES[key].includes(h))
    if (index === -1) missing.push(key)
    else indexes[key] = index
  }
  return { indexes, missing }
}

const onFileChange = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  resetResult()
  fileName.value = file.name

  if (/\.xls$/i.test(file.name)) {
    showMessage(t('budget.import.xlsNotSupported'), 'error')
    resetResult()
    if (fileInput.value) fileInput.value.value = ''
    return
  }

  parsing.value = true
  try {
    const { default: readXlsxFile } = await import('read-excel-file/browser')
    const sheets = await readXlsxFile(file)
    const data = sheets[0]?.data
    if (!data || data.length === 0) {
      showMessage(t('budget.import.noSheet'), 'error')
      return
    }

    const { indexes: col, missing } = findColumnIndexes(data[0] ?? [])
    if (missing.length > 0) {
      showMessage(
        t('budget.import.missingColumns', { cols: missing.map((k) => t(COLUMN_LABEL_KEYS[k])).join(', ') }),
        'error',
      )
      resetResult()
      return
    }

    const rows: ParsedRow[] = []
    for (let i = 1; i < data.length; i++) {
      const rowNumber = i + 1
      const cells = data[i] ?? []
      const dateRaw = cells[col.date]
      const assetRaw = cells[col.asset]
      const categoryRaw = cells[col.category]
      const memoRaw = cells[col.memo]
      const amountRaw = cells[col.amount]
      const typeRaw = cells[col.type]

      // 완전히 빈 행은 건너뜀
      if (![dateRaw, assetRaw, categoryRaw, memoRaw, amountRaw, typeRaw].some((v) => v != null && cellToString(v).trim() !== '')) {
        continue
      }

      const entryDate = parseDateCell(dateRaw)
      const amount = parseAmountCell(amountRaw)
      const type = parseTypeCell(typeRaw)
      const categoryName = cleanCategoryName(categoryRaw)
      const paymentMethodName = cellToString(assetRaw).trim()
      const memo = cellToString(memoRaw).trim()

      let error: string | null = null
      if (!entryDate) error = t('budget.import.errDate')
      else if (!type) error = t('budget.import.errType')
      else if (!categoryName) error = t('budget.import.errCategory')
      else if (amount === null || amount <= 0) error = t('budget.import.errAmount')

      rows.push({ rowNumber, entryDate, paymentMethodName, categoryName, memo, amount, type, error })
    }

    parsedRows.value = rows
    if (rows.length === 0) {
      showMessage(t('budget.import.noRows'), 'warning')
    }
  } catch (err) {
    console.error('엑셀 파싱 오류:', err)
    showMessage(t('budget.import.parseFailed'), 'error')
    resetResult()
  } finally {
    parsing.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

const triggerFileSelect = () => {
  fileInput.value?.click()
}

const downloadingTemplate = ref(false)
const downloadTemplate = async () => {
  downloadingTemplate.value = true
  try {
    const { default: writeXlsxFile } = await import('write-excel-file/browser')
    const sampleRows = [
      { date: '2026-01-15', asset: t('budget.import.sampleAsset1'), category: t('budget.import.sampleCategory1'), memo: t('budget.import.sampleMemo1'), amount: 12000, type: t('budget.common.expense') },
      { date: '2026-01-25', asset: t('budget.import.sampleAsset2'), category: t('budget.import.sampleCategory2'), memo: '', amount: 3000000, type: t('budget.common.income') },
    ]
    const columns = [
      { header: t('budget.import.colDate'), cell: (r: (typeof sampleRows)[number]) => ({ value: r.date }), width: 12 },
      { header: t('budget.import.colAsset'), cell: (r: (typeof sampleRows)[number]) => ({ value: r.asset }), width: 12 },
      { header: t('budget.import.colCategory'), cell: (r: (typeof sampleRows)[number]) => ({ value: r.category }), width: 12 },
      { header: t('budget.import.colMemo'), cell: (r: (typeof sampleRows)[number]) => ({ value: r.memo }), width: 16 },
      { header: t('budget.import.colAmount'), cell: (r: (typeof sampleRows)[number]) => ({ value: r.amount, type: Number }), width: 12 },
      { header: t('budget.import.colType'), cell: (r: (typeof sampleRows)[number]) => ({ value: r.type }), width: 10 },
    ]
    await writeXlsxFile(sampleRows, { columns }).toFile(t('budget.import.templateFilename'))
  } catch (err) {
    console.error('양식 다운로드 오류:', err)
    showMessage(t('budget.import.templateFailed'), 'error')
  } finally {
    downloadingTemplate.value = false
  }
}

const doImport = async () => {
  if (validRows.value.length === 0) return
  importing.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    // 가져온 내역의 통화 = 가져오기 시점의 기준통화 (BUDGET_GLOBALIZATION.md 통화 설계 6항)
    await userDataStore.ensureGoals()

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
      (n) => !categories.some((c) => c.type === n.type && normalizeForMatch(c.name) === normalizeForMatch(n.name)),
    )
    if (missingCategories.length > 0) {
      const rows = missingCategories.map((n) => {
        const sortOrder = categoryTypeCounts[n.type]++
        return { user_id: user.id, type: n.type, name: n.name, sort_order: sortOrder }
      })
      const { data: inserted, error } = await supabase.from('budget_categories').insert(rows).select()
      if (error) throw error
      categories.push(...((inserted ?? []) as BudgetCategory[]))
    }

    // ── 누락된 결제수단 생성 ──────────────────────────
    let pmSortOrder = paymentMethods.length
    const missingPaymentMethods = newPaymentMethodNames.value.filter(
      (name) => !paymentMethods.some((p) => normalizeForMatch(p.name) === normalizeForMatch(name)),
    )
    if (missingPaymentMethods.length > 0) {
      const rows = missingPaymentMethods.map((name) => ({ user_id: user.id, name, sort_order: pmSortOrder++ }))
      const { data: inserted, error } = await supabase.from('budget_payment_methods').insert(rows).select()
      if (error) throw error
      paymentMethods.push(...((inserted ?? []) as BudgetPaymentMethod[]))
    }

    // ── 내역 등록 ──────────────────────────
    const entries = validRows.value.map((r) => {
      const category = categories.find(
        (c) => c.type === r.type && normalizeForMatch(c.name) === normalizeForMatch(r.categoryName),
      )
      const paymentMethod = r.paymentMethodName
        ? paymentMethods.find((p) => normalizeForMatch(p.name) === normalizeForMatch(r.paymentMethodName))
        : null
      return {
        user_id: user.id,
        category_id: category!.id,
        type: r.type,
        amount: r.amount,
        payment_method_id: paymentMethod?.id ?? null,
        memo: r.memo || null,
        entry_date: r.entryDate,
        currency: baseCurrency.value,
      }
    })

    const CHUNK_SIZE = 500
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const chunk = entries.slice(i, i + CHUNK_SIZE)
      const { error } = await supabase.from('budget_entries').insert(chunk)
      if (error) throw error
    }

    showMessage(t('budget.import.importDone', { count: entries.length }), 'success')
    resetResult()
  } catch (err) {
    console.error('가져오기 오류:', err)
    showMessage(t('budget.import.importFailed'), 'error')
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
        <div class="font-weight-bold">{{ $t('budget.import.title') }}</div>
        <div class="text-medium-emphasis">{{ $t('budget.import.subtitle') }}</div>
      </div>
    </div>

    <div class="glass-card pa-4 mb-3">
      <div class="format-title mb-2">{{ $t('budget.import.formatTitle') }}</div>
      <div class="text-medium-emphasis mb-3" style="font-size: 0.8125rem">
        {{ $t('budget.import.formatDesc') }}
      </div>
      <div class="column-chip-wrap mb-3">
        <span v-for="label in requiredColumnLabels" :key="label" class="column-chip">{{ label }}</span>
      </div>
      <v-btn
        block
        variant="tonal"
        color="primary"
        rounded="lg"
        prepend-icon="mdi-download-outline"
        :loading="downloadingTemplate"
        @click="downloadTemplate"
      >
        {{ $t('budget.import.downloadTemplate') }}
      </v-btn>
    </div>

    <div class="pc-notice mb-4">
      <v-icon size="16" class="mr-1">mdi-monitor</v-icon>
      <i18n-t tag="span" keypath="budget.import.pcNotice"><template #pc><b>{{ $t('budget.import.pcEnv') }}</b></template></i18n-t>
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
      {{ fileName || $t('budget.import.selectFile') }}
    </v-btn>

    <template v-if="parsedRows.length > 0">
      <div class="d-flex ga-2 mt-4 mb-3">
        <div class="summary-chip">{{ $t('budget.import.totalCount', { count: parsedRows.length }) }}</div>
        <div class="summary-chip summary-chip-ok">{{ $t('budget.import.okCount', { count: validRows.length }) }}</div>
        <div v-if="errorRows.length > 0" class="summary-chip summary-chip-error">{{ $t('budget.import.errorCount', { count: errorRows.length }) }}</div>
      </div>

      <div v-if="newCategoryNames.length > 0 || newPaymentMethodNames.length > 0" class="glass-card pa-3 mb-3">
        <div v-if="newCategoryNames.length > 0" class="mb-1" style="font-size: 0.8125rem">
          <b>{{ $t('budget.import.newCategories') }}</b>: {{ newCategoryNames.map((c) => c.name).join(', ') }}
        </div>
        <div v-if="newPaymentMethodNames.length > 0" style="font-size: 0.8125rem">
          <b>{{ $t('budget.import.newPaymentMethods') }}</b>: {{ newPaymentMethodNames.join(', ') }}
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
            <div class="preview-error-text">{{ $t('budget.import.rowError', { row: r.rowNumber, error: r.error }) }}</div>
          </template>
          <template v-else>
            <div class="preview-main">
              <div class="preview-date">{{ r.entryDate }}</div>
              <div class="preview-category">{{ r.categoryName }}<span v-if="r.memo"> · {{ r.memo }}</span></div>
            </div>
            <div :class="r.type === 'INCOME' ? 'income-color' : 'expense-color'">
              {{ formatBudgetAmount(r.amount ?? 0, baseCurrency) }}
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
        {{ $t('budget.import.importButton', { count: validRows.length }) }}
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

.column-chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.column-chip {
  padding: 4px 10px;
  border-radius: 20px;
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
  font-size: 0.75rem;
  font-weight: 600;
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

.pc-notice {
  display: flex;
  align-items: center;
  text-align: left;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.75rem;
}
</style>
