import { supabase } from '@/services/supabase'
import { getStockPrice } from '@/services/market'
import { getCachedExchangeRate } from '@/services/exchangeRateCache'
import { useUserDataStore } from '@/stores/userData'
import { evaluateItemBase, simpleCostBase } from '@/utils/portfolioMath'
import { isCash } from '@/config/marketConfig'

// PortfolioView.vue와 동일한 portfolioMath 공식을 사용한다 (src/utils/portfolioMath.ts).
// 거래 추가/수정/삭제 직후에도 대시보드 등에서 총자산이 바로 반영되도록
// 자산 탭을 열지 않고도 asset_summary를 재계산해서 저장한다.
export const recomputeAssetSummary = async (userId: string): Promise<void> => {
  try {
    const userDataStore = useUserDataStore()
    const { data, error } = await supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', userId)
    if (error) throw error

    const items = data ?? []
    // 기준통화: 사용자 목표 설정을 따른다 (GLOBALIZATION.md 단계 C)
    const goal = await userDataStore.ensureGoals()
    const base = goal?.base_currency ?? 'KRW'
    const rate = await getCachedExchangeRate()
    const prices = await Promise.all(
      items.map((item) =>
        isCash(item)
          ? Promise.resolve(null)
          : getStockPrice(item.ticker, item).catch(() => null),
      ),
    )

    let totalEval = 0
    let totalCost = 0
    items.forEach((item, i) => {
      if (isCash(item)) return

      const currentPrice = prices[i] && prices[i]! > 0 ? prices[i] : null
      const { evaluationAmountBase } = evaluateItemBase(item, currentPrice, rate, base)

      totalEval += evaluationAmountBase
      totalCost += simpleCostBase(item, rate, base)
    })

    const { error: upsertError } = await supabase.from('asset_summary').upsert(
      {
        user_id: userId,
        current_asset: Math.round(totalEval),
        investment_principal: Math.round(totalCost),
        base_currency: base,
      },
      { onConflict: 'user_id' },
    )
    if (upsertError) throw upsertError

    userDataStore.portfolios = items
    userDataStore.portfoliosLoaded = true
    userDataStore.invalidateAssetSummary()
  } catch (e) {
    console.warn('asset_summary 재계산 실패:', e)
  }
}
