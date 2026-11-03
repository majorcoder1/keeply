// Checklist notes: a note with `kind: 'list'` and `items: [{ id, text, done }]`.

export function newItemId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3)
}

export function newItem(text = '', done = false) {
  return { id: newItemId(), text, done }
}

export function cleanItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((i) => ({ id: i.id || newItemId(), text: String(i.text || '').replace(/\s+/g, ' ').trim(), done: !!i.done }))
    .filter((i) => i.text !== '')
}

// Unticked items first, ticked ones after (when "move checked items to the bottom" is on).
export function splitItems(items, checkedToBottom) {
  if (!checkedToBottom) return { open: items, done: [] }
  return { open: items.filter((i) => !i.done), done: items.filter((i) => i.done) }
}

export function listToText(items) {
  return cleanItems(items).map((i) => `${i.done ? '[x]' : '[ ]'} ${i.text}`).join('\n')
}
