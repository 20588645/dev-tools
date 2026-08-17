import { describe, expect, it } from 'vitest'

import {
  credentialTemplateHtml,
  isSecretCredentialField,
  plainTextToNotebookHtml,
  sanitizeNotebookHtml,
} from './notebook-html'

describe('notebook HTML boundary', () => {
  it('keeps semantic content while removing source styles and executable markup', () => {
    const result = sanitizeNotebookHtml(`
      <div class="source" style="color:red" onclick="alert(1)">
        <h2>标题</h2><script>alert(1)</script><p><strong>正文</strong></p>
      </div>
    `)

    expect(result).toContain('<h2>标题</h2>')
    expect(result).toContain('<strong>正文</strong>')
    expect(result).not.toMatch(/style=|class=|onclick=|script/i)
  })

  it('allows only http links and local notebook images', () => {
    const result = sanitizeNotebookHtml(`
      <a href="javascript:alert(1)">危险</a>
      <a href="https://example.com/path">安全</a>
      <img src="https://evil.example/image.png">
      <img src="http://127.0.0.1:13900/api/notebook/images/0123456789abcdef.png" alt="本地图">
    `)

    expect(result).not.toContain('javascript:')
    expect(result).toContain('href="https://example.com/path"')
    expect(result).not.toContain('evil.example')
    expect(result).toContain('src="/api/notebook/images/0123456789abcdef.png"')
  })

  it('treats password-like field names as secrets without matching account', () => {
    expect(isSecretCredentialField('密码')).toBe(true)
    expect(isSecretCredentialField('SSH Key')).toBe(true)
    expect(isSecretCredentialField('AccessKey')).toBe(true)
    expect(isSecretCredentialField('口令')).toBe(true)
    expect(isSecretCredentialField('password')).toBe(true)
    expect(isSecretCredentialField('账号')).toBe(false)
    expect(isSecretCredentialField('主机')).toBe(false)
    expect(isSecretCredentialField('monkey')).toBe(false)
  })

  it('preserves the controlled credential structure and dynamic colspan', () => {
    const source = credentialTemplateHtml().replace('colspan="2"', 'colspan="4"')
    const result = sanitizeNotebookHtml(source)

    expect(result).toContain('data-notebook-block="credential"')
    expect(result).toContain('data-credential-project')
    expect(result).toContain('data-credential-field')
    expect(result).toContain('data-credential-value')
    expect(result).toContain('colspan="4"')
    expect(result).not.toContain('点击填写')
  })

  it('keeps pasted URLs as plain text until the user explicitly creates a link', () => {
    expect(plainTextToNotebookHtml('https://example.com')).toBe('<p>https://example.com</p>')
    expect(plainTextToNotebookHtml('参考 https://example.com')).not.toContain('<a ')
  })
})
