import { ref, nextTick, onMounted, onUnmounted, type Ref } from 'vue'

// 가계부 내역추가의 날짜/카테고리/금액 하단 고정 패널은 기기마다 실제 높이가
// 다르므로, 콘텐츠가 패널 높이를 넘으면 스크롤 대신 세로로 축소해서 항상
// 한 화면에 꽉 차게 맞춘다.
export const useFitToPanel = (
  rootRef: Ref<HTMLElement | undefined>,
  scaleWrapRef: Ref<HTMLElement | undefined>,
) => {
  const scale = ref(1)
  const rootHeight = ref<number>()

  const fit = () => {
    const scaleWrap = scaleWrapRef.value
    const panel = rootRef.value?.parentElement
    if (!scaleWrap || !panel) return
    const naturalHeight = scaleWrap.scrollHeight
    const availableHeight = panel.clientHeight
    if (!naturalHeight || !availableHeight) return
    scale.value = naturalHeight > availableHeight ? availableHeight / naturalHeight : 1
    rootHeight.value = naturalHeight * scale.value
  }

  onMounted(async () => {
    await nextTick()
    fit()
    window.addEventListener('resize', fit)
  })
  onUnmounted(() => window.removeEventListener('resize', fit))

  return { scale, rootHeight, fit }
}
