import assert from 'node:assert/strict'
import test from 'node:test'

import {
  compareBaseline,
  countFindings,
  inspectSource,
} from './validate-component-architecture.mjs'

test('detects business-page architecture violations in Vue source', () => {
  const source = `<script setup lang="ts">
import { NButton } from 'naive-ui'
globalThis.setInterval(() => {}, 1000)
fetch('/api/example')
document.querySelector('#outside')
</script>
<template>
  <button type="button">Open</button>
  <table><tbody /></table>
</template>
<style scoped>
.page :deep(.n-button__content) { display: block; }
</style>`

  const findings = inspectSource('frontend/src/views/example/ExampleView.vue', source)
  const rules = findings.map(finding => finding.rule)

  assert.equal(rules.filter(rule => rule === 'third-party-ui-import').length, 1)
  assert.equal(rules.filter(rule => rule === 'direct-interval').length, 1)
  assert.equal(rules.filter(rule => rule === 'view-network-or-ipc').length, 1)
  assert.equal(rules.filter(rule => rule === 'document-query').length, 1)
  assert.equal(rules.filter(rule => rule === 'native-control').length, 1)
  assert.equal(rules.filter(rule => rule === 'native-table').length, 1)
  assert.equal(rules.filter(rule => rule === 'deep-selector').length, 1)
  assert.equal(rules.filter(rule => rule === 'naive-internal-selector').length, 1)
})

test('does not inspect native-looking tags outside the Vue template', () => {
  const source = `<script setup lang="ts">
const example = '<button>not rendered</button>'
</script>
<template><BaseButton>Rendered</BaseButton></template>`

  const findings = inspectSource('frontend/src/views/example/ExampleView.vue', source)
  assert.equal(findings.some(finding => finding.rule === 'native-control'), false)
})

test('ratchet rejects increases, transfers, and unsynchronized reductions', () => {
  const baseline = {
    'naive-internal-selector': {
      'frontend/src/views/a.css': 2,
    },
  }

  const increase = compareBaseline({
    'naive-internal-selector': { 'frontend/src/views/a.css': 3 },
  }, baseline)
  const transfer = compareBaseline({
    'naive-internal-selector': {
      'frontend/src/views/a.css': 2,
      'frontend/src/views/b.css': 1,
    },
  }, baseline)
  const reduction = compareBaseline({
    'naive-internal-selector': { 'frontend/src/views/a.css': 1 },
  }, baseline)

  assert.equal(increase.length, 1)
  assert.equal(transfer.length, 1)
  assert.equal(reduction.length, 1)
})

test('countFindings groups debt by rule and file', () => {
  const findings = [
    { rule: 'native-table', file: 'frontend/src/views/a.vue' },
    { rule: 'native-table', file: 'frontend/src/views/a.vue' },
    { rule: 'native-table', file: 'frontend/src/views/b.vue' },
  ]

  const counts = countFindings(findings)
  assert.equal(counts['native-table']['frontend/src/views/a.vue'], 2)
  assert.equal(counts['native-table']['frontend/src/views/b.vue'], 1)
})
