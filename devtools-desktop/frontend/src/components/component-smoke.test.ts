import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BaseButton from './base/BaseButton.vue'
import PageFrame from './layout/PageFrame.vue'

describe('shared UI foundation', () => {
  it('exposes button loading and disabled semantics', () => {
    const wrapper = mount(BaseButton, {
      props: { loading: true },
      slots: { default: '保存' },
    })
    const button = wrapper.get('button')

    expect(button.attributes('aria-busy')).toBe('true')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.text()).toContain('保存')
  })

  it('keeps page top outside the scrollable body slot', () => {
    const wrapper = mount(PageFrame, {
      slots: {
        top: '<header data-test="top">顶部</header>',
        default: '<div data-test="body">正文</div>',
      },
    })

    expect(wrapper.get('[data-test="top"]').element.parentElement?.className).toBe('page-frame')
    expect(wrapper.get('[data-test="body"]').element.closest('main')).toBeTruthy()
  })
})
