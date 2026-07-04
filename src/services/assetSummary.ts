import { supabase } from '@/services/supabase'
import { getStockPrice } from '@/services/market'
import { getCachedExchangeRate } from '@/services/exchangeRateCache'
import { useUserDataStore } from '@/stores/userData'
import { evaluateItemKrw, simpleCostKrw } from '@/utils/portfolioMath'

// PortfolioView.vue와 동일한 portfolioMath 공식을 사용한다 (src/utils/portfolioMath.ts).
// 거래 추가/수정/삭제 직후에도 대시보드 등에서 총자산이 바로 반영되도록
// 자산 탭을 열지 않고도 asset_summary를 재계산해서 저장한다.
export const recomputeAssetSummary = async (userId: string): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', userId)
    if (error) throw error

    const items = data ?? []
    const rate = await getCachedExchangeRate()
    const prices = await Promise.all(
      items.map((item) =>
        item.asset_type === '현금'
          ? Promise.resolve(null)
          : getStockPrice(item.ticker, item.asset_type, item.currency).catch(() => null),
      ),
    )

    let totalEval = 0
    let totalCost = 0
    items.forEach((item, i) => {
      if (item.asset_type === '현금') return

      const currentPrice = prices[i] && prices[i]! > 0 ? prices[i] : null
      const { evaluationAmountKrw } = evaluateItemKrw(item, currentPrice, rate)

      totalEval += evaluationAmountKrw
      totalCost += simpleCostKrw(item, rate)
    })

    const { error: upsertError } = await supabase.from('asset_summary').upsert(
      {
        user_id: userId,
        current_asset: Math.round(totalEval),
        investment_principal: Math.round(totalCost),
      },
      { onConflict: 'user_id' },
    )
    if (upsertError) throw upsertError

    const userDataStore = useUserDataStore()
    userDataStore.portfolios = items
    userDataStore.portfoliosLoaded = true
    userDataStore.invalidateAssetSummary()
  } catch (e) {
    console.warn('asset_summary 재계산 실패:', e)
  }
}
