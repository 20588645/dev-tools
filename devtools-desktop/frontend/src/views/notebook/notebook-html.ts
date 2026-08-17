const ALLOWED_TAGS = new Set([
  'P', 'DIV', 'BR', 'H2', 'H3', 'UL', 'OL', 'LI',
  'STRONG', 'B', 'EM', 'I', 'U', 'S', 'A',
  'BLOCKQUOTE', 'PRE', 'CODE', 'TABLE', 'THEAD',
  'TBODY', 'TR', 'TH', 'TD', 'IMG',
])

const NOTEBOOK_IMAGE_PATH = /^\/api\/notebook\/images\/[a-f0-9]{16}\.(?:png|jpe?g|webp|gif)$/i

export function safeNotebookHttpUrl(value: string) {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

export function notebookImagePath(value: string) {
  if (!value) return ''
  try {
    const url = new URL(value, 'http://127.0.0.1')
    return NOTEBOOK_IMAGE_PATH.test(url.pathname) ? url.pathname : ''
  } catch {
    return ''
  }
}

export function sanitizeNotebookHtml(html: string) {
  const template = document.createElement('template')
  template.innerHTML = String(html ?? '')
  template.content.querySelectorAll('script, style, iframe, object, embed, form, input, button').forEach((element) => element.remove())

  Array.from(template.content.querySelectorAll('*')).reverse().forEach((element) => {
    const tag = element.tagName
    const href = tag === 'A' ? element.getAttribute('href') ?? '' : ''
    const imagePath = tag === 'IMG' ? notebookImagePath(element.getAttribute('src') ?? '') : ''
    const imageAlt = tag === 'IMG' ? element.getAttribute('alt') ?? '' : ''
    const credentialBlock = tag === 'TABLE' && element.getAttribute('data-notebook-block') === 'credential'
    const credentialValue = tag === 'TD' && element.hasAttribute('data-credential-value')
    const credentialProject = tag === 'TH' && element.hasAttribute('data-credential-project')
    const credentialField = tag === 'TH' && element.hasAttribute('data-credential-field')
    const credentialColspan = credentialProject
      ? Math.max(1, Math.min(12, Number.parseInt(element.getAttribute('colspan') ?? '1', 10) || 1))
      : 1

    if (!ALLOWED_TAGS.has(tag)) {
      element.replaceWith(...element.childNodes)
      return
    }

    Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name))

    if (tag === 'A') {
      const safeHref = safeNotebookHttpUrl(href)
      if (!safeHref) {
        element.replaceWith(...element.childNodes)
        return
      }
      element.setAttribute('href', safeHref)
      element.setAttribute('target', '_blank')
      element.setAttribute('rel', 'noreferrer noopener')
    }

    if (tag === 'IMG') {
      if (!imagePath) {
        element.remove()
        return
      }
      element.setAttribute('src', imagePath)
      element.setAttribute('alt', imageAlt.slice(0, 160))
    }

    if (credentialBlock) element.setAttribute('data-notebook-block', 'credential')
    if (credentialValue) element.setAttribute('data-credential-value', '')
    if (credentialField) element.setAttribute('data-credential-field', '')
    if (credentialProject) {
      element.setAttribute('data-credential-project', '')
      element.setAttribute('colspan', String(credentialColspan))
    }
  })

  return template.innerHTML
}

export function notebookTextFromHtml(html: string) {
  const template = document.createElement('template')
  template.innerHTML = sanitizeNotebookHtml(html)
  return (template.content.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function plainTextToNotebookHtml(text: string) {
  return String(text ?? '').split(/\r?\n/).map((line) => {
    const paragraph = document.createElement('p')
    if (line) {
      paragraph.textContent = line
    } else {
      paragraph.append(document.createElement('br'))
    }
    return paragraph.outerHTML
  }).join('')
}

export function isSecretCredentialField(name: string) {
  return /密码|口令|密匙|密钥|token|secret|password|passwd|accesskey|(?:^|[^a-z])key(?:$|[^a-z])/i.test(name.trim())
}

export function credentialTemplateHtml() {
  return '<table data-notebook-block="credential"><thead><tr><th data-credential-project colspan="2"></th></tr><tr><th data-credential-field>账号</th><th data-credential-field>密码</th></tr></thead><tbody><tr><td data-credential-value></td><td data-credential-value></td></tr></tbody></table><p><br></p>'
}
