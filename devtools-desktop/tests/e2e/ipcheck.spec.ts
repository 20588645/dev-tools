import { expect, test, type Page } from '@playwright/test'

const mockResult = {
  ip: '8.8.8.8',
  location: '美国 弗吉尼亚州 Ashburn',
  asn: 'AS15169',
  asn_owner_type: 'ISP',
  asn_owner: 'Google LLC',
  org_type: 'ISP',
  org: 'Google LLC',
  longitude: '39.03',
  latitude: '-77.5',
  ip_type: '企业专线 IP',
  risk_score: '0%',
  risk_label: '极度纯净',
  native_ip: '非原生 IP',
  shared_users: '6 用户',
  shared_users_level: '优质共享',
  shared_users_percent: 10,
  openai_support: '✅ 完美支持',
  scenarios: [
    { name: 'TikTok', stars: '★★★★★', advice: '非常适合' },
    { name: '跨境电商', stars: '★★★★★', advice: '非常适合' },
    { name: '社媒运营', stars: '★★★★☆', advice: '适合' },
    { name: 'AI 应用', stars: '★★★★★', advice: '完美支持' },
  ],
  _raw: {
    proxy: false,
    type: 'Business',
    risk: 0,
    devices_address: 6,
    devices_subnet: 0,
    country_code: 'US',
  },
}

async function openIpCheck(page: Page) {
  await page.route('**/api/ipcheck/lookup**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockResult) })
  })
  await page.goto('/?apiPort=13900')
  await page.locator('.sidebar-item[data-page="ipcheck"]').click()
  await expect(page.getByRole('heading', { name: '纯净检测', exact: true })).toBeVisible()
  await expect(page.locator('#page-ipcheck').getByText('8.8.8.8', { exact: true })).toBeVisible()
}

async function expectNoHorizontalOverflow(page: Page) {
  const layout = await page.locator('#page-ipcheck').evaluate((activePage) => ({
    document: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    page: activePage.scrollWidth > activePage.clientWidth,
  }))
  expect(layout).toEqual({ document: false, page: false })
}

test('renders the confirmed Vue page at the default window size in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 1665, height: 1184 })
  await page.emulateMedia({ colorScheme: 'light' })
  await openIpCheck(page)

  await expect(page.locator('#page-ipcheck')).toHaveCount(1)
  await expect(page.locator('.ip-check-view')).toHaveCount(1)
  await expect(page.locator('.legacy-ipcheck-fallback')).toHaveCount(0)
  await expect(page.locator('#ipcheckInput')).toHaveCount(0)
  await expect(page.locator('.page.active')).toHaveCount(1)
  await expectNoHorizontalOverflow(page)

  // P9-8：主题菜单已删，侧栏按钮循环 system→light→dark
  for (let i = 0; i < 3 && !(await page.locator('body[data-theme="dark"]').count()); i++) {
    await page.locator('[data-test="theme-toggle"]').click()
  }
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('heading', { name: '业务场景建议', exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('validates input, updates data, and preserves the last result across navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openIpCheck(page)

  const input = page.getByRole('textbox', { name: 'IP 地址或域名' })
  await input.fill('999.1.1.1')
  await page.getByRole('button', { name: '检测', exact: true }).click()
  await expect(page.getByText('请输入有效的 IPv4、IPv6 或域名', { exact: true })).toBeVisible()

  await input.fill('8.8.8.8')
  await input.press('Enter')
  await expect(page.getByText('AS15169', { exact: true })).toBeVisible()

  await page.locator('.sidebar-item[data-page="home"]').click()
  await expect(page.locator('#page-home')).toHaveClass(/\bactive\b/)
  await page.locator('.sidebar-item[data-page="ipcheck"]').click()
  await expect(page.locator('#page-ipcheck').getByText('8.8.8.8', { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('stays readable without horizontal overflow at the minimum window size', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 })
  await openIpCheck(page)

  await expect(page.getByRole('heading', { name: '网络与地理信息', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '网络信号', exact: true })).toBeVisible()
  await expect(page.getByRole('progressbar', { name: '共享程度' })).toHaveAttribute('aria-valuenow', '10')
  await expectNoHorizontalOverflow(page)
})

test('uses the shared notification host for copy feedback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => localStorage.setItem('ipcheck-copied-text', value),
      },
    })
  })
  await openIpCheck(page)

  await page.getByRole('button', { name: '复制详情', exact: true }).click()
  await expect(page.locator('.n-message').filter({ hasText: '已复制当前 IP 详情' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ipcheck-copied-text'))).toContain('IP: 8.8.8.8')

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => Promise.reject(new Error('clipboard denied')),
      },
    })
  })
  await page.getByRole('button', { name: '复制详情', exact: true }).click()
  await expect(page.locator('.n-message').filter({ hasText: '当前环境未开放剪贴板权限' })).toBeVisible()
})
