// The caller's IP address, as Cloudflare reports it. Only Cloudflare can set this header on the
// deployed site; locally it is missing, and every request shares one rate-limit key.
export function clientIp(headers: Headers): string {
  return headers.get('cf-connecting-ip')?.trim() || 'unknown';
}

// What the audit log keeps of an IP address (overview §10.10): enough to spot a pattern, not to
// identify a household. IPv4 keeps the first three parts, IPv6 the first three groups.
export function truncateIp(ip: string): string | null {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return `${ip.split('.').slice(0, 3).join('.')}.0`;
  if (ip.includes(':')) {
    const groups = ip.split('::')[0].split(':').filter(Boolean);
    return `${groups.slice(0, 3).join(':')}::`;
  }
  return null;
}
