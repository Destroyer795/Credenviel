import React from 'react'

export function Logo({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
      aria-label="Credenviel Logo"
    >
      {/* Dark Charcoal Crest Base */}
      <rect width="36" height="36" rx="8" fill="#252B32" />
      
      {/* Inner Slate Shield Contour */}
      <path
        d="M18 6.5L27.5 11.2V19.8C27.5 24.2 23.5 27.8 18 29.5C12.5 27.8 8.5 24.2 8.5 19.8V11.2L18 6.5Z"
        stroke="#BFE3F2"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="#2E3A4B"
      />
      
      {/* Stylized "C" Arc in Ice Blue */}
      <path
        d="M14 18.2C14 15.6 15.8 13.8 18.5 13.8C20.6 13.8 22.2 15 22.8 16.8"
        stroke="#BFE3F2"
        strokeWidth="2"
        strokeLinecap="round"
      />
      
      {/* Cryptographic Verification Checkmark */}
      <path
        d="M15.5 19.5L18.2 22.2L23.5 16.5"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
