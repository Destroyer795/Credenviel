import { PublicClientApplication } from '@azure/msal-browser'

const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID || ''
const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID || ''
const redirectUri = import.meta.env.VITE_ENTRA_REDIRECT_URI || window.location.origin

export const isEntraConfigured = Boolean(clientId && tenantId)

export const msalConfig = {
  auth: {
    clientId: clientId || '00000000-0000-0000-0000-000000000000',
    authority: `https://login.microsoftonline.com/${tenantId || 'common'}`,
    redirectUri: redirectUri,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
}

export const loginRequest = {
  scopes: isEntraConfigured ? [`api://${clientId}/access_as_user`] : ['User.Read'],
}

let msalInstance = null
if (isEntraConfigured) {
  try {
    msalInstance = new PublicClientApplication(msalConfig)
  } catch (err) {
    console.warn('Failed to initialize MSAL instance:', err)
  }
}

export { msalInstance }
