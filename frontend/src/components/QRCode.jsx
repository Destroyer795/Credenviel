import React, { useState, useEffect } from 'react'
import QRCodeLib from 'qrcode'

export function QRCode({ value, size = 160, className = '', style = {} }) {
  const [dataUrl, setDataUrl] = useState('')

  useEffect(() => {
    if (!value) return
    QRCodeLib.toDataURL(value, {
      width: size * 2, // 2x density for crisp retina display
      margin: 1,
      color: {
        dark: '#252B32',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    })
      .then(setDataUrl)
      .catch((err) => console.error('QR code generation error:', err))
  }, [value, size])

  if (!dataUrl) {
    return (
      <div
        style={{
          width: size,
          height: size,
          background: 'var(--bg-frost)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.72rem',
          color: 'var(--text-muted)',
          ...style,
        }}
        className={className}
      >
        Generating QR...
      </div>
    )
  }

  return (
    <img
      src={dataUrl}
      alt="Cryptographic Verification QR Code"
      width={size}
      height={size}
      style={{
        borderRadius: 8,
        border: '1px solid var(--border-slate)',
        background: '#FFFFFF',
        display: 'block',
        ...style,
      }}
      className={className}
    />
  )
}
