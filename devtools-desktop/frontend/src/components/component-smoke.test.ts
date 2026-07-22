import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'

import '@/styles/tokens/index.css'
import BaseButton from './base/BaseButton.vue'
import BaseDialog from './feedback/BaseDialog.vue'
import BaseInput from './form/BaseInput.vue'
import BaseTabs from './navigation/BaseTabs.vue'
import PageFrame from './layout/PageFrame.vue'
import NaiveUiShowcase from './vendor/NaiveUiShowcase.vue'
import UiLibraryProvider from './vendor/UiLibraryProvider.vue'
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

  it('provides accessible form and navigation contracts', async () => {
    const input = mount(BaseInput, { props: { label: '名称', modelValue: '' } })
    await input.get('input').setValue('新名称')
    expect(input.emitted('update:modelValue')).toEqual([['新名称']])
    expect(input.get('label').attributes('for')).toBe(input.get('input').attributes('id'))

    const tabs = mount(BaseTabs, {
      props: {
        modelValue: 'one',
        items: [{ label: '一', value: 'one' }, { label: '二', value: 'two' }],
      },
    })
    await tabs.findAll('[role="tab"]')[1].trigger('click')
    expect(tabs.emitted('update:modelValue')).toEqual([['two']])
  })

  it('closes the Naive UI-backed dialog through its project contract', async () => {
    const dialog = mount(BaseDialog, {
      props: { modelValue: true, title: '测试弹窗' },
      attachTo: document.body,
    })
    const close = document.body.querySelector('button[aria-label="关闭"]')
    if (!close) throw new Error('关闭按钮未渲染')
    close.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await dialog.vm.$nextTick()
    expect(dialog.emitted('update:modelValue')).toContainEqual([false])
    dialog.unmount()
  })

  it('mounts and exposes third-party complex controls through the adapter layer', async () => {
    const wrapper = mount(UiLibraryProvider, {
      global: { plugins: [createPinia()] },
      slots: { default: NaiveUiShowcase },
    })

    expect(wrapper.find('.vendor-showcase').exists()).toBe(true)
    expect(wrapper.find('input').exists()).toBe(true)
    expect(wrapper.find('table').text()).toContain('personalTools')
    expect(wrapper.findAll('input').length).toBeGreaterThanOrEqual(2)
    expect(wrapper.text()).toContain('Naive UI 适配层')
    const projectInput = wrapper.findAll('input')[0]
    if (!projectInput) throw new Error('项目输入框未渲染')
    await projectInput.setValue('新的项目')
    expect((projectInput.element as HTMLInputElement).value).toBe('新的项目')
    wrapper.unmount()
  })
})
