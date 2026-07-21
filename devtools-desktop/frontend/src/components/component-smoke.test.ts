import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'

import BaseButton from './base/BaseButton.vue'
import PageFrame from './layout/PageFrame.vue'
import UiFoundationPreview from '@/views/UiFoundationPreview.vue'

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

  it('switches preview tabs and opens the dialog', async () => {
    const wrapper = mount(UiFoundationPreview, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    })
    const feedbackTab = wrapper.findAll('[role="tab"]').find((tab) => tab.text() === '反馈状态')
    if (!feedbackTab) throw new Error('反馈状态 Tab 未渲染')
    await feedbackTab.trigger('click')
    expect(wrapper.text()).toContain('正在读取 Sidecar 状态')
    expect(wrapper.text()).not.toContain('按钮与状态')

    const basicTab = wrapper.findAll('[role="tab"]').find((tab) => tab.text() === '基础控件')
    if (!basicTab) throw new Error('基础控件 Tab 未渲染')
    await basicTab.trigger('click')
    const openButton = wrapper.findAll('button').find((button) => button.text() === '打开弹窗')
    if (!openButton) throw new Error('打开弹窗按钮未渲染')
    await openButton.trigger('click')
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
    wrapper.unmount()
  })
})
