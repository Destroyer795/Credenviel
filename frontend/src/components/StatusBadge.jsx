import React from 'react'

export function StatusBadge({ status }) {
  const normalized = (status || 'unknown').toLowerCase().replace(' ', '_')

  const labelMap = {
    awaiting_upload: 'Awaiting Upload',
    queued: 'Queued',
    processing: 'OCR Processing',
    processed: 'Digitized & Issued',
    requires_review: 'Requires Review',
    failed: 'Failed',
  }

  const label = labelMap[normalized] || status || 'Unknown'

  return (
    <span id={`badge-${normalized}`} className={`status-badge status-${normalized}`}>
      <span className="status-dot" />
      {label}
    </span>
  )
}
