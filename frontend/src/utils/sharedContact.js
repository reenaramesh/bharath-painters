// Shared text is untrusted and is only used to prefill an editable review form.
export function parseSharedContact({ title = '', text = '', url = '' } = {}) {
  const content = [text, title].join('\n').slice(0, 8000);
  const plain = content.replace(/https?:\/\/\S+/gi, '');
  const match = plain.match(/(?:\+|00)?\d[\d ().-]{5,}\d/) || plain.match(/\b\d+\b/);
  const mobile = match?.[0]?.trim() || '';
  const lines = plain.replace(mobile, '').split(/[\n\r]+/)
    .map(line => line.replace(/^(?:name|mobile|phone|telephone|number)\s*:\s*/i, '').trim())
    .filter(line => line && !/^(?:truecaller|shared (?:via|from)|view .*truecaller|mobile|phone|number)/i.test(line));
  const cleanTitle = title.trim();
  const name = cleanTitle && !/truecaller|https?:|\d{5}/i.test(cleanTitle)
    ? cleanTitle : (lines[0] || '');
  // URL-only shares cannot establish a caller name. Extract only a numeric
  // Truecaller search path; never fetch a shared URL.
  const urlNumber = url.match(/truecaller\.com\/search\/[^/]+\/(\+?\d+)/i)?.[1];
  return { name: name.slice(0, 150), mobile: mobile || urlNumber || '' };
}
