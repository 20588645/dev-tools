import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { installUiLibrary } from '@/plugins/ui-library'

import BaseSelect from './BaseSelect.vue'

const NODE_OPTIONS = [
  { value: '', label: '系统默认 (18.19.1)' },
  { value: '18.19.1', label: '18.19.1' },
  { value: '20.19.2', label: '20.19.2' },
]

function mountSelect(props: Record<string, unknown>) {
  return mount(BaseSelect, {
    props: { options: NODE_OPTIONS, label: 'Node 版本', ...props },
    global: { plugins: [installUiLibrary] },
  })
}

describe('BaseSelect', () => {
  /*
    回归：原实现一律 `modelValue || null`，于是「系统默认」这类 value 为空串的
    合法选项永远显示成 placeholder（「请选择」）——用户看不到实际选中的是什么。
    本地运行页的 Node 版本下拉与部署面板的项目默认配置都依赖这个语义。
  */
  it('空串是合法选项时显示该选项的标签，而非占位符', () => {
    const wrapper = mountSelect({ modelValue: '', placeholder: '请选择' })

    expect(wrapper.text()).toContain('系统默认 (18.19.1)')
    expect(wrapper.text()).not.toContain('请选择')
  })

  it('选项里没有空串项时，空值仍表示未选择', () => {
    const wrapper = mount(BaseSelect, {
      props: {
        options: NODE_OPTIONS.filter(option => option.value !== ''),
        modelValue: '',
        placeholder: '请选择',
        label: 'Node 版本',
      },
      global: { plugins: [installUiLibrary] },
    })

    expect(wrapper.text()).toContain('请选择')
  })

  it('有具体取值时显示对应标签', () => {
    const wrapper = mountSelect({ modelValue: '20.19.2', placeholder: '请选择' })

    expect(wrapper.text()).toContain('20.19.2')
    expect(wrapper.text()).not.toContain('请选择')
  })
})
