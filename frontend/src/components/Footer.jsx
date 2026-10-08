import React from 'react'

export function Footer() {
  return (
    <footer className="app-footer">
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <strong>Credenviel</strong> — Enterprise Certificate Digitization & Verification Pipeline
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem' }}>
          <span>Azure Container Apps (Go & Python)</span>
          <span>Azure Blob Storage</span>
          <span>Azure Service Bus</span>
          <span>Azure Key Vault HSM</span>
          <span>PostgreSQL Flexible Server</span>
        </div>
      </div>
    </footer>
  )
}
