import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { h } from 'vue'
import { describe, expect, it } from 'vitest'

import '@/styles/tokens/index.css'
import BaseButton from './base/BaseButton.vue'
import BaseCard from './base/BaseCard.vue'
import BaseEntityCard from './base/BaseEntityCard.vue'
import BaseSelectableItem from './base/BaseSelectableItem.vue'
import BaseDialog from './feedback/BaseDialog.vue'
import AppToastHost from './feedback/AppToastHost.vue'
import BaseDataTable from './data/BaseDataTable.vue'
import type { BaseDataTableColumn, BaseDataTableRow } from './data/base-data-table'
import BaseDisclosure from './disclosure/BaseDisclosure.vue'
import BaseCheckbox from './form/BaseCheckbox.vue'
import BaseInput from './form/BaseInput.vue'
import BaseTextarea from './form/BaseTextarea.vue'
import BaseProgress from './base/BaseProgress.vue'
import BaseSideNav from './navigation/BaseSideNav.vue'
import BaseTabs from './navigation/BaseTabs.vue'
import FilterChip from './navigation/FilterChip.vue'
import PageFrame from './layout/PageFrame.vue'
import NaiveUiShowcase from './vendor/NaiveUiShowcase.vue'
import UiLibraryProvider from './vendor/UiLibraryProvider.vue'
import UiFoundationPreview from '@/views/UiFoundationPreview.vue'
import { useNotificationStore } from '@/stores/notification'

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

  it('exposes selectable list-item state through the project contract', async () => {
    const wrapper = mount(BaseSelectableItem, {
      props: { selected: true, pressed: true, appearance: 'row' },
      slots: { default: '<strong>周一</strong><span>已保存</span>' },
    })

    expect(wrapper.classes()).toContain('is-selected')
    expect(wrapper.classes()).toContain('base-selectable-item--row')
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('true')
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('provides a structured entity card with accessible expandable details', async () => {
    const wrapper = mount(BaseEntityCard, {
      props: {
        modelValue: false,
        ariaLabel: '账号卡片',
        detailsLabel: '账号详情',
        detailsAriaLabel: '展开账号详情',
      },
      slots: {
        icon: 'A',
        title: 'GitHub',
        subtitle: 'user@example.com',
        default: '123 456',
        status: '30 秒周期',
        actions: '<button type="button">复制</button>',
        details: 'SHA1 · 6 位',
      },
    })

    expect(wrapper.attributes('aria-label')).toBe('账号卡片')
    expect(wrapper.text()).toContain('GitHub')
    expect(wrapper.text()).toContain('30 秒周期')
    // 默认状态是独立面板，不在底部说明位
    expect(wrapper.find('.base-entity-card__status').exists()).toBe(true)
    expect(wrapper.find('.base-entity-card__footer-status').exists()).toBe(false)
    expect(wrapper.get('.base-entity-card__details-trigger').attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('.base-entity-card__details-trigger').attributes('aria-label')).toBe('展开账号详情')
    await wrapper.get('.base-entity-card__details-trigger').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toContainEqual([true])
  })

  it('moves entity card status into the footer and stretches the body on request', () => {
    const wrapper = mount(BaseEntityCard, {
      props: { statusPlacement: 'footer', bodyAlign: 'stretch' },
      slots: {
        icon: 'A',
        title: 'GitHub',
        headerExtra: '<span data-test="tag">工作</span>',
        default: '123 456',
        status: '30 秒周期',
        actions: '<button type="button">复制</button>',
        details: 'SHA1 · 6 位',
      },
    })

    // 状态只渲染一次，且落在底部说明位而不是独立面板
    expect(wrapper.find('.base-entity-card__status').exists()).toBe(false)
    expect(wrapper.get('.base-entity-card__footer-status').text()).toBe('30 秒周期')
    expect(wrapper.get('.base-entity-card__body').classes()).toContain('base-entity-card__body--stretch')
    expect(wrapper.get('.base-entity-card__header-extra').text()).toBe('工作')
    // 底部状态占位时，详情与操作收在右侧同一控制组里
    expect(wrapper.find('.base-entity-card__footer-controls .base-entity-card__details-trigger').exists()).toBe(true)
    // 箭头必须是固定尺寸的 SVG：文字字形会带基线偏移，展开前后位置对不齐
    expect(wrapper.get('.base-entity-card__details-arrow').element.tagName.toLowerCase()).toBe('svg')
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
    const wrapper = mount(UiLibraryProvider, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
      slots: { default: UiFoundationPreview },
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

    const chip = mount(FilterChip, {
      props: { label: '开发', count: 3, selected: true, ariaLabel: '筛选开发，3 个账号' },
    })
    expect(chip.get('[aria-label="筛选开发，3 个账号"]').attributes('aria-pressed')).toBe('true')
  })

  it('clamps shared progress values through the project adapter', () => {
    const progress = mount(BaseProgress, {
      props: { value: 120, label: '共享程度', tone: 'warning' },
    })

    expect(progress.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('100')
    expect(progress.get('[role="progressbar"]').attributes('aria-label')).toBe('共享程度')

    const circle = mount(BaseProgress, {
      props: { value: 32, shape: 'circle', size: 52, label: '剩余时间' },
      slots: { default: '32s' },
    })
    expect(circle.classes()).toContain('base-progress--circle')
    expect(circle.text()).toContain('32s')
  })

  it('paces progress fills over the tick interval instead of jumping per update', () => {
    const steady = mount(BaseProgress, { props: { value: 60 } })
    expect(steady.classes()).not.toContain('base-progress--ticking')

    const ticking = mount(BaseProgress, {
      props: { value: 60, rail: 'visible', tickInterval: 1000 },
    })
    expect(ticking.classes()).toContain('base-progress--ticking')
    expect(ticking.attributes('style')).toContain('--base-progress-tick: 1000ms')
  })

  it('provides project-owned data table, disclosure, and side navigation contracts', async () => {
    type Row = BaseDataTableRow & { id: number, name: string }
    const columns: BaseDataTableColumn<Row>[] = [
      { key: 'name', title: '名称' },
    ]
    const table = mount(UiLibraryProvider, {
      global: { plugins: [createPinia()] },
      slots: {
        default: () => h(BaseDataTable<Row>, {
          columns,
          rows: [{ id: 1, name: '本地项目' }],
          rowKey: row => row.id,
          ariaLabel: '项目列表',
        }),
      },
    })
    expect(table.get('[role="region"]').attributes('aria-label')).toBe('项目列表')
    expect(table.find('table').text()).toContain('本地项目')

    const disclosure = mount(BaseDisclosure, {
      props: { modelValue: false, title: '高级设置' },
      slots: { default: '折叠内容' },
    })
    const disclosureButton = disclosure.get('.base-disclosure__trigger')
    expect(disclosureButton.attributes('aria-expanded')).toBe('false')
    expect(disclosureButton.attributes('aria-controls')).toBeDefined()
    await disclosureButton.trigger('click')
    expect(disclosure.emitted('update:modelValue')).toContainEqual([true])

    const flushDisclosure = mount(BaseDisclosure, {
      props: {
        modelValue: true,
        title: '无内边距内容',
        headerPadding: '8px',
        headerMinHeight: '42px',
        contentGap: '0',
        contentPadding: '0',
      },
      slots: { default: '内容' },
    })
    expect(flushDisclosure.get('.base-disclosure__content').attributes('style')).toContain('padding: 0px')
    expect(flushDisclosure.get('.base-disclosure__trigger').attributes('style')).toContain('min-height: 42px')
    expect(flushDisclosure.attributes('style')).toContain('--base-disclosure-content-gap: 0')

    const nav = mount(BaseSideNav, {
      props: {
        modelValue: 'general',
        items: [
          { value: 'general', label: '常规', meta: '01' },
          { value: 'about', label: '关于', meta: '02' },
        ],
      },
    })
    const selected = nav.get('.n-menu-item-content--selected')
    expect(selected.text()).toContain('01')
    expect(selected.text()).toContain('常规')
    expect(selected.attributes('style')).toContain('padding-left: 8px')
    const about = nav.findAll('[role="menuitem"]').find(item => item.text().includes('关于'))
    if (!about) throw new Error('侧边导航项目未渲染')
    await about.get('.n-menu-item-content').trigger('click')
    expect(nav.emitted('update:modelValue')).toContainEqual(['about'])

    const horizontalNav = mount(BaseSideNav, {
      props: {
        modelValue: 'general',
        mode: 'horizontal',
        density: 'compact',
        items: [{ value: 'general', label: '常规' }],
      },
    })
    expect(horizontalNav.classes()).toContain('base-side-nav--horizontal')
    expect(horizontalNav.find('.n-menu--horizontal').exists()).toBe(true)
  })

  it('exposes layout variants without page-level internal selectors', () => {
    const card = mount(BaseCard, {
      props: {
        fillHeight: true,
        contentLayout: 'fill',
        contentOverflow: 'auto',
        contentBackground: 'var(--color-surface-subtle)',
      },
      slots: { default: '内容' },
    })
    expect(card.classes()).toContain('base-card--fill-height')
    expect(card.get('.n-card-content').attributes('style')).toContain('background')

    const title = mount(BaseInput, {
      props: { modelValue: '标题', variant: 'title', label: '项目', labelVariant: 'eyebrow', size: 'lg' },
    })
    expect(title.get('.field-control').classes()).toContain('field-control--title')
    expect(title.get('.field-control').classes()).toContain('field-control--label-eyebrow')

    const search = mount(BaseInput, { props: { modelValue: '', type: 'search', variant: 'search' } })
    expect(search.get('.field-control').classes()).toContain('field-control--search')
    expect(search.get('input').attributes('type')).toBe('search')

    const completedInput = mount(BaseInput, { props: { modelValue: '完成事项', textVariant: 'completed' } })
    expect(completedInput.get('.field-control').classes()).toContain('field-control--text-completed')

    const checkboxOnly = mount(BaseCheckbox, {
      props: { modelValue: false, label: '未完成', ariaLabel: '切换子任务 1', labelVisible: false },
    })
    expect(checkboxOnly.get('.n-checkbox').attributes('aria-label')).toBe('切换子任务 1')
    expect(checkboxOnly.find('.choice-control__copy').exists()).toBe(false)

    const editor = mount(BaseTextarea, {
      props: { modelValue: '正文', variant: 'editor', label: '正文', labelVariant: 'eyebrow', textVariant: 'relaxed', fillHeight: true },
    })
    expect(editor.get('.field-control').classes()).toContain('field-control--fill-height')
    expect(editor.get('.field-control').classes()).toContain('field-control--label-eyebrow')
    expect(editor.get('.field-control').classes()).toContain('field-control--text-relaxed')
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

    expect(wrapper.find('.ui-library-provider').exists()).toBe(true)
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

  it('renders project notifications through the Naive Message host', async () => {
    const pinia = createPinia()
    const wrapper = mount(UiLibraryProvider, {
      attachTo: document.body,
      global: { plugins: [pinia] },
      slots: { default: AppToastHost },
    })
    const notifications = useNotificationStore(pinia)

    notifications.push('适配层通知', 'success', 0)
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    const message = document.body.querySelector('.n-message')
    expect(message?.textContent).toContain('适配层通知')
    expect(message?.classList.contains('n-message--success-type')).toBe(true)
    expect(document.body.querySelector('.toast')).toBeNull()
    expect(wrapper.get('[aria-live="polite"]').text()).toContain('适配层通知')

    notifications.clear()
    await wrapper.vm.$nextTick()
    wrapper.unmount()
  })
})
