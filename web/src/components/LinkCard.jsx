import { useLinkPreview } from '../lib/linkpreview'

// A preview card for one web address. Shows nothing until a preview is found.
export default function LinkCard({ url, store, enabled, compact = false }) {
  const { ref, phase, data } = useLinkPreview(store, url, enabled)
  return (
    <div ref={ref} className="lc-slot">
      {phase === 'ready' && data && (
        <a className={`lc ${compact ? 'compact' : ''}`} href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          {data.image && <img className="lc-img" src={data.image} alt="" loading="lazy" />}
          <span className="lc-body">
            <span className="lc-title">{data.title || data.site || url}</span>
            {!compact && data.description && <span className="lc-desc">{data.description}</span>}
            <span className="lc-site">{data.site || new URL(url).hostname}</span>
          </span>
        </a>
      )}
    </div>
  )
}
