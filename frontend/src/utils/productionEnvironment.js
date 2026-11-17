// Build-time guard only. Never include environment values in diagnostics.
export function validateProductionEnvironment(env) {
  for (const name of Object.keys(env)) {
    if (name.startsWith('VITE_') && /BREVO|SMTP|DATABASE|REDIS|DJANGO|SECRET|PASSWORD|TOKEN|API_KEY/i.test(name)) {
      throw new Error(`Server-only credential must not use the frontend variable ${name}.`);
    }
  }
  let url;
  try { url = new URL(env.VITE_API_URL); } catch { throw new Error('Set VITE_API_URL to the public HTTPS backend origin followed by /api.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || url.pathname.replace(/\/$/,'') !== '/api' || !url.hostname.includes('.')
      || url.hostname.endsWith('.') || url.hostname.endsWith('.local') || url.hostname.endsWith('.localhost')
      || /^\d+(?:\.\d+)*$/.test(url.hostname) || url.hostname.includes(':') || url.port) {
    throw new Error('VITE_API_URL must be a public HTTPS API base without credentials, query or fragment.');
  }
}
