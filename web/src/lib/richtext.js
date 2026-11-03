// Rich-text notes are stored as HTML tagged with a hidden marker, so old plain-text
// notes (which never start with the marker) keep working untouched and nothing in
// the schema has to change. Everything here runs in the browser (uses the DOM).

export const RICH_MARKER = '<!--html-->'

export function isRich(body) {
  return typeof body === 'string' && body.startsWith(RICH_MARKER)
}

// Only these tags/attrs survive — pasted or execCommand HTML is rebuilt from scratch,
// so scripts, event handlers, iframes, etc. can never be stored or re-rendered.
const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'SPAN', 'FONT', 'MARK', 'BR', 'DIV', 'P', 'UL', 'OL', 'LI'])
const ALLOWED_STYLE = /^(font-family|font-size|font-weight|font-style|text-decoration|color|background-color)$/

function filterStyle(style) {
  return (style || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((rule) => ALLOWED_STYLE.test(rule.split(':')[0].trim().toLowerCase()))
    .join('; ')
}

function clean(node, out) {
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) { out.appendChild(document.createTextNode(child.nodeValue)); return }
    if (child.nodeType !== 1) return
    const tag = child.tagName
    if (tag === 'SCRIPT' || tag === 'STYLE') return
    if (ALLOWED_TAGS.has(tag)) {
      const el = document.createElement(tag)
      const style = filterStyle(child.getAttribute('style'))
      if (style) el.setAttribute('style', style)
      if (tag === 'FONT') {
        ['face', 'size', 'color'].forEach((a) => { if (child.hasAttribute(a)) el.setAttribute(a, child.getAttribute(a)) })
      }
      clean(child, el)
      out.appendChild(el)
    } else {
      // Disallowed wrapper: keep its contents, drop the tag.
      clean(child, out)
    }
  })
}

export function sanitizeHtml(html) {
  const src = document.createElement('div')
  src.innerHTML = html || ''
  const dst = document.createElement('div')
  clean(src, dst)
  return dst.innerHTML
}

// True if the (already-sanitized) HTML carries any actual formatting worth keeping.
export function hasFormatting(html) {
  return /<(b|strong|i|em|u|s|mark|font)\b/i.test(html) ||
    /style="[^"]*(font-|text-decoration|color|background)/i.test(html)
}

// Plain-text version for card previews (strips the marker + tags, keeps the line breaks).
export function toPlainText(body) {
  if (!body) return ''
  if (!isRich(body)) return body
  const raw = body.slice(RICH_MARKER.length)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li)>/gi, '\n')
  const tmp = document.createElement('div')
  tmp.innerHTML = raw
  return (tmp.textContent || '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
