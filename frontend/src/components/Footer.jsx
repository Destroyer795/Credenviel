import React from 'react'
import { IconShield } from './Icons'

export function Footer() {
  return (
    <footer className="app-footer">
      <div style={{ maxWidth: '1320px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <IconShield size={16} color="var(--slate-blue)" />
          <strong style={{ color: 'var(--text-main)' }}>Credenviel</strong>
          <span style={{ color: 'var(--border-subtle)' }}>|</span>
          <span style={{ color: 'var(--text-sub)' }}>Cryptographic Credential Pipeline</span>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.78rem', color: 'var(--slate-blue)', flexWrap: 'wrap' }}>
          <span>Azure Container Apps (Go & Python)</span>
          <span>Blob Storage SAS</span>
          <span>Azure Service Bus</span>
          <span>Azure Key Vault HSM</span>
          <span>PostgreSQL Flexible Server</span>
        </div>
      </div>
    </footer>
  )
}
