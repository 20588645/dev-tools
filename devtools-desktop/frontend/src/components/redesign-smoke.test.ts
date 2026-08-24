import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ProjectCard from './cards/ProjectCard.vue'
import StatCard from './cards/StatCard.vue'
import AreaChart from './charts/AreaChart.vue'
import BarChart from './charts/BarChart.vue'
import RankBar from './charts/RankBar.vue'
import ScoreRing from './charts/ScoreRing.vue'
import SplitBar from './charts/SplitBar.vue'
import Sparkline from './charts/Sparkline.vue'
import GroupSection from './disclosure/GroupSection.vue'
import SidePanel from './layout/SidePanel.vue'

describe('redesign-v2 shared components', () => {
  it('renders the unified project card with status edge and bottom action bar', () => {
    const card = mount(ProjectCard, {
      props: { name: 'ldts-backend', path: '/Users/dev/ldts-backend', status: 'running' },
      slots: {
        badge: '<span data-test="badge">运行中</span>',
        meta: '<span data-test="tag">node</span>',
        footnote: '已运行 2h 14m',
        actions: '<button type="button">日志</button>',
      },
    })

    expect(card.classes()).toContain('project-card--running')
    expect(card.attributes('data-status')).toBe('running')
    expect(card.get('.project-card__name').text()).toBe('ldts-backend')
    expect(card.get('.project-card__path').attributes('title')).toBe('/Users/dev/ldts-backend')
    expect(card.get('[data-test="badge"]').text()).toBe('运行中')
    expect(card.get('.project-card__footnote').text()).toContain('已运行')
    expect(card.get('.project-card__actions button').text()).toBe('日志')
  })

  it('renders the stat card with tone bar, value, and meta line', () => {
    const stat = mount(StatCard, {
      props: { label: '本月 Token', tone: 'running' },
      slots: { default: '1.28M<small>≈¥42.10</small>', meta: '较上月 <b>+12%</b>' },
    })

    expect(stat.classes()).toContain('stat-card--running')
    expect(stat.get('.stat-card__label').text()).toBe('本月 Token')
    expect(stat.get('.stat-card__value').text()).toContain('1.28M')
    expect(stat.get('.stat-card__meta b').text()).toBe('+12%')
  })

  it('keeps the side panel resident, collapsible, and scrollable', async () => {
    const panel = mount(SidePanel, {
      props: { title: 'Git 活动参考', subtitle: '本周 18 条', width: '300px' },
      slots: {
        default: '<div data-test="entry">feat: 新增部署配置</div>',
        actions: '<button type="button" data-test="refresh">刷新</button>',
      },
    })

    expect(panel.attributes('aria-label')).toBe('Git 活动参考')
    expect(panel.attributes('style')).toContain('width: 300px')
    expect(panel.get('.side-panel__subtitle').text()).toBe('本周 18 条')
    expect(panel.get('[data-test="entry"]').element.closest('.side-panel__body')).not.toBeNull()

    await panel.setProps({ collapsed: true })
    expect(panel.attributes('style')).toContain('display: none')
  })

  it('wires the group section title, count, and rename entry', async () => {
    const group = mount(GroupSection, {
      props: { modelValue: true, title: '后端服务', count: 4, renamable: true },
      slots: { default: '<div data-test="grid">项目网格</div>' },
    })

    expect(group.get('.group-section__title').text()).toBe('后端服务')
    expect(group.get('.group-section__count').text()).toContain('4')
    expect(group.find('[data-test="grid"]').exists()).toBe(true)

    await group.get('button[aria-label="重命名分组"]').trigger('click')
    expect(group.emitted('rename')).toHaveLength(1)

    await group.get('.base-disclosure__trigger').trigger('click')
    expect(group.emitted('update:modelValue')).toContainEqual([false])
  })

  it('exposes meter semantics on the score ring and rank bar', () => {
    const ring = mount(ScoreRing, {
      props: { value: 132, size: 100, label: '纯净评分' },
    })
    expect(ring.attributes('role')).toBe('meter')
    expect(ring.attributes('aria-valuenow')).toBe('100')
    expect(ring.get('.score-ring__center').text()).toBe('100')
    expect(ring.findAll('circle')).toHaveLength(2)

    const rank = mount(RankBar, {
      props: { label: 'Claude', value: '612K', detail: '$12.50', percent: 48, series: 1 },
    })
    expect(rank.attributes('aria-valuenow')).toBe('48')
    expect(rank.get('.rank-bar__fill').attributes('style')).toContain('width: 48%')
    expect(rank.get('.rank-bar__value').text()).toBe('612K')
    expect(rank.get('.rank-bar__detail').text()).toBe('$12.50')
  })

  it('normalizes split bar segments and renders the legend', () => {
    const split = mount(SplitBar, {
      props: {
        segments: [
          { label: 'Claude', percent: 48 },
          { label: 'GPT', percent: 31 },
          { label: 'Gemini', percent: 21 },
        ],
      },
    })

    expect(split.findAll('.split-bar__segment')).toHaveLength(3)
    expect(split.findAll('.split-bar__legend-item')).toHaveLength(3)
    expect(split.get('.split-bar__legend').text()).toContain('Claude 48%')
  })

  it('draws chart primitives from normalized values', () => {
    const spark = mount(Sparkline, { props: { values: [3, 8, 5, 12], area: true } })
    expect(spark.findAll('path')).toHaveLength(2)
    expect(spark.get('path:last-of-type').attributes('d')).toContain('M')

    const area = mount(AreaChart, {
      props: { values: [10, 40, 25, 60], labels: ['一', '二', '三', '今'], markers: [3] },
    })
    expect(area.findAll('circle')).toHaveLength(1)
    expect(area.findAll('.area-chart__labels span')).toHaveLength(4)

    const bars = mount(BarChart, {
      props: { values: [2, 6, 4], labels: ['一', '二', '三'], showValues: true },
    })
    expect(bars.findAll('.bar-chart__bar')).toHaveLength(3)
    expect(bars.findAll('.bar-chart__value')[1].text()).toBe('6')
    const tallest = bars.findAll('.bar-chart__bar')[1]
    expect(tallest.attributes('style')).toContain('height: 100%')
  })
})
