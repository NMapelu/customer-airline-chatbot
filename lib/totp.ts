// Time-based one-time passwords (RFC 6238, SHA-1, 6 digits, 30 seconds), as used by
// authenticator apps. Only the development test user needs this: real users type their code.
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input: string): Uint8Array<ArrayBuffer> {
  const clean = input.replace(/[\s=]/g, '').toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('the TOTP secret is not valid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export async function totp(secret: string, timeMs = Date.now(), digits = 6): Promise<string> {
  const counter = Math.floor(timeMs / 1000 / 30);
  const message = new ArrayBuffer(8);
  const view = new DataView(message);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const key = await crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, [
    'sign',
  ]);
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]) %
    10 ** digits;
  return code.toString().padStart(digits, '0');
}
