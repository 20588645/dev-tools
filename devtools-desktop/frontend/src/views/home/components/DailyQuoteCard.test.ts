import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DailyQuoteCard from './DailyQuoteCard.vue'

describe('DailyQuoteCard', () => {
  it('changes or saves a quote only after explicit user actions', async () => {
    const wrapper = mount(DailyQuoteCard, {
      props: {
        dateLabel: '7月22日星期三',
        quote: '把复杂留给系统，把简单留给自己。',
        quoteIndex: 0,
        saved: false,
        switching: false,
      },
    })

    expect(wrapper.emitted('next')).toBeUndefined()
    expect(wrapper.emitted('toggleSaved')).toBeUndefined()
    expect(wrapper.text()).not.toContain('只在主动切换时改变')

    const buttons = wrapper.findAll('button')
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')

    expect(wrapper.emitted('next')).toHaveLength(1)
    expect(wrapper.emitted('toggleSaved')).toHaveLength(1)
  })
})
