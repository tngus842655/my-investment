import type { InjectionKey, Ref } from 'vue'

export interface FeedbackBadge {
  isAdmin: Ref<boolean>
  unreadFeedbackCount: Ref<number>
}

export const feedbackBadgeKey: InjectionKey<FeedbackBadge> = Symbol('feedbackBadge')
