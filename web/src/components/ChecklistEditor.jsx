import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { newItem, splitItems } from '../lib/checklist'

// The body of a checklist note. Honors the two settings:
//   addToBottom     new items go at the bottom (off: at the top)
//   checkedToBottom ticked items drop into a "Completed" group (off: they stay where they are)
export default function ChecklistEditor({ items, setItems, addToBottom, checkedToBottom }) {
  const [draft, setDraft] = useState('')
  const [showDone, setShowDone] = useState(true)
  const [focusId, setFocusId] = useState(null)
  const inputs = useRef(new Map())

  // Move the cursor to a row we just made.
  useEffect(() => {
    if (focusId && inputs.current.get(focusId)) {
      inputs.current.get(focusId).focus()
      setFocusId(null)
    }
  }, [focusId, items])

  const { open, done } = splitItems(items, checkedToBottom)

  function update(id, patch) {
    setItems(items.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }
  function remove(id) {
    setItems(items.filter((i) => i.id !== id))
  }
  function insertAfter(id) {
    const fresh = newItem()
    const at = items.findIndex((i) => i.id === id)
    setItems([...items.slice(0, at + 1), fresh, ...items.slice(at + 1)])
    setFocusId(fresh.id)
  }
  function addDraft() {
    const text = draft.trim()
    if (!text) return
    const fresh = newItem(text)
    setItems(addToBottom ? [...items, fresh] : [fresh, ...items])
    setDraft('')
  }

  function onRowKey(e, item) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (item.text.trim()) insertAfter(item.id)
    } else if (e.key === 'Backspace' && item.text === '') {
      e.preventDefault()
      const at = items.findIndex((i) => i.id === item.id)
      remove(item.id)
      const before = items[at - 1]
      if (before) setFocusId(before.id)
    }
  }

  const row = (item) => (
    <div className={`cl-row ${item.done ? 'done' : ''}`} key={item.id}>
      <input type="checkbox" className="cl-check" checked={item.done} onChange={() => update(item.id, { done: !item.done })} aria-label={item.done ? 'Mark not done' : 'Mark done'} />
      <input
        ref={(el) => { if (el) inputs.current.set(item.id, el); else inputs.current.delete(item.id) }}
        className="cl-text"
        value={item.text}
        placeholder="List item"
        onChange={(e) => update(item.id, { text: e.target.value })}
        onKeyDown={(e) => onRowKey(e, item)}
      />
      <button type="button" className="cl-x" onClick={() => remove(item.id)} aria-label="Delete item" title="Delete item"><Icon name="close" size={18} /></button>
    </div>
  )

  const addRow = (
    <div className="cl-row cl-add" key="add">
      <span className="cl-plus"><Icon name="add" size={22} /></span>
      <input
        className="cl-text"
        value={draft}
        placeholder="List item"
        aria-label="Add a list item"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraft() } }}
        onBlur={addDraft}
      />
    </div>
  )

  return (
    <div className="cl" role="group" aria-label="Checklist">
      {!addToBottom && addRow}
      {open.map(row)}
      {addToBottom && addRow}
      {done.length > 0 && (
        <>
          <button type="button" className="cl-done-head" onClick={() => setShowDone((s) => !s)} aria-expanded={showDone}>
            <span className={`cl-caret ${showDone ? 'open' : ''}`}>▸</span> {done.length} completed item{done.length === 1 ? '' : 's'}
          </button>
          {showDone && done.map(row)}
        </>
      )}
    </div>
  )
}
