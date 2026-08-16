import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectDialogContract } from './validate-dialog-contract.mjs'

test('rejects per-page BaseDialog width and body size overrides', () => {
  const source = `<template>
  <BaseDialog
    title="运行配置"
    width="min(720px, 94vw)"
    body-max-height="min(720px, 78vh)"
    body-height="620px"
  />
</template>`

  const rules = inspectDialogContract('frontend/src/views/run/RunConfigDialog.vue', source).map(item => item.rule)
  assert.ok(rules.includes('dialog-width-override'))
  assert.ok(rules.includes('dialog-body-max-override'))
  assert.ok(rules.includes('dialog-body-height-override'))
})

test('allows size tokens without per-page dimensions', () => {
  const source = `<template>
  <BaseDialog title="确认" size="compact" />
  <BaseDialog title="配置" />
</template>`

  const findings = inspectDialogContract('frontend/src/views/example/ExampleDialog.vue', source)
  assert.equal(findings.length, 0)
})

test('rejects homemade Naive modal or native dialog outside BaseDialog', () => {
  const naive = inspectDialogContract(
    'frontend/src/views/run/RunView.vue',
    `<script setup>import { NModal } from 'naive-ui'</script><template><NModal /></template>`,
  )
  assert.equal(naive.some(item => item.rule === 'homemade-nmodal'), true)

  const native = inspectDialogContract(
    'frontend/src/views/run/RunView.vue',
    `<template><dialog open>确认</dialog></template>`,
  )
  assert.equal(native.some(item => item.rule === 'native-dialog-element'), true)
})

test('rejects homemade log <pre> inside dialog components', () => {
  const source = `<template>
  <BaseDialog title="正在更新">
    <pre class="settings-upgrade__log">building</pre>
  </BaseDialog>
</template>`

  const findings = inspectDialogContract(
    'frontend/src/views/settings/components/UpgradeProgressDialog.vue',
    source,
  )
  assert.equal(findings.some(item => item.rule === 'dialog-custom-log-pre'), true)
})
