/** معرّف حركة خزنة قصير وعالي التفرد، صالح للعمل دون اتصال. */
export function nextTreasuryTransactionNumber(): string {
  const year = new Date().getFullYear();
  let token = '';
  try {
    const bytes = new Uint8Array(6);
    globalThis.crypto.getRandomValues(bytes);
    token = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('').toUpperCase();
  } catch {
    token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
  }
  return `TX-${year}-${token}`;
}
