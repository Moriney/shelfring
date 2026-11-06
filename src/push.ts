// Web Push without a library: payload encryption (RFC 8291, aes128gcm from RFC 8188)
// and VAPID authentication (RFC 8292), with Web Crypto only.

const enc = new TextEncoder();
export const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const cat = (...a: Uint8Array<ArrayBuffer>[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bytes: number) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
}

/** Encrypts one push message for a subscription. `test` injects the sender key and salt for the RFC 8291 test vector. */
export async function encrypt(payload: string, p256dh: string, auth: string, test?: { asPrivate: JsonWebKey; salt: Uint8Array<ArrayBuffer> }) {
  const ua = unb64u(p256dh);
  const as = test
    ? { privateKey: await crypto.subtle.importKey('jwk', test.asPrivate, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']),
        publicKey: await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: test.asPrivate.x, y: test.asPrivate.y }, { name: 'ECDH', namedCurve: 'P-256' }, true, []) }
    : await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as EcdhKeyDeriveParams, as.privateKey, 256));
  const ikm = await hkdf(unb64u(auth), ecdh, cat(enc.encode('WebPush: info\0'), ua, asPub), 32);
  const salt = test?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(enc.encode(payload), new Uint8Array([2]))));
  const head = new Uint8Array(21); head.set(salt); new DataView(head.buffer).setUint32(16, 4096); head[20] = 65;
  return cat(head, asPub, body);
}

/** VAPID header for a push service origin. publicKey: 65-byte point, privateKey: 32-byte scalar, both base64url. */
export async function vapid(endpoint: string, publicKey: string, privateKey: string, subject: string) {
  const pub = unb64u(publicKey);
  const jwk = { kty: 'EC', crv: 'P-256', d: privateKey, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)) };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const part = (o: object) => b64u(enc.encode(JSON.stringify(o)));
  const unsigned = part({ typ: 'JWT', alg: 'ES256' }) + '.' + part({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject });
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)));
  return `vapid t=${unsigned}.${b64u(sig)}, k=${publicKey}`;
}

/** Sends one message. Returns the push service status; 404 and 410 mean the subscription is gone. */
export async function send(sub: { endpoint: string; p256dh: string; auth: string }, payload: string, keys: { pub: string; priv: string; subject: string }) {
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapid(sub.endpoint, keys.pub, keys.priv, keys.subject), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal' },
    body: await encrypt(payload, sub.p256dh, sub.auth)
  });
  return r.status;
}
