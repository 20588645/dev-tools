import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DailyQuoteCard from './DailyQuoteCard.vue'

describe('DailyQuoteCard', () => {
  it('changes or saves a quote only after explicit user actions', async () => {
    const wrapper = mount(DailyQuoteCard, {
      props: {
        dateLabel: '8月13日 星期四',
        quote: '把复杂留给系统，把简单留给自己。',
        saved: false,
        savedCount: 2,
        switching: false,
        greeting: '下午好',
        activityTotal: 6,
      },
    })

    expect(wrapper.emitted('next')).toBeUndefined()
    expect(wrapper.emitted('toggleSaved')).toBeUndefined()
    expect(wrapper.text()).toContain('已收藏 2 条')

    const buttons = wrapper.findAll('button')
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')

    expect(wrapper.emitted('toggleSaved')).toHaveLength(1)
    expect(wrapper.emitted('next')).toHaveLength(1)
  })
})
