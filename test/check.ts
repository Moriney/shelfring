// One runnable check for the logic that is easy to break: node test/check.ts
import assert from 'node:assert/strict';
import { encrypt, b64u, unb64u } from '../src/push.ts';
import { inArea, cityKey, checkPhoto, cents, money, parseDraft, signList, readList } from '../src/util.ts';

// Web Push encryption: RFC 8291, appendix A
const body = await encrypt('When I grow up, I want to be a watermelon', 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg', {
  asPrivate: { kty: 'EC', crv: 'P-256', d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', ...(() => { const p = unb64u('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'); return { x: b64u(p.slice(1, 33)), y: b64u(p.slice(33)) }; })() },
  salt: unb64u('DGv6ra1nlYgDCS1FRnbzlw')
});
assert.equal(b64u(body), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');

// Area: soft filter on the Cloudflare location fields
const hki = { country: 'FI', regionCode: '18', city: 'Helsinki' };
assert.ok(inArea(hki, []), 'no area means public');
assert.ok(inArea(hki, ['city:FI/espoo', 'city:FI/helsinki']));
assert.ok(inArea(hki, ['region:FI-18']) && inArea(hki, ['country:FI']));
assert.ok(!inArea({ country: 'FI', regionCode: '19', city: 'Turku' }, ['region:FI-18']));
assert.ok(!inArea(undefined, ['country:FI']), 'unknown location fails a set area');
assert.equal(cityKey('Sörnäinen  Kallio'), 'sornainen-kallio');

// Photos: JPEG and WebP pass, EXIF fails
const jpeg = (app1: boolean) => new Uint8Array([0xff, 0xd8, 0xff, app1 ? 0xe1 : 0xe0, 0, 4, 0, 0, 0xff, 0xda, 0, 2, 9, 9]);
assert.deepEqual(checkPhoto(jpeg(false)), { type: 'image/jpeg' });
assert.deepEqual(checkPhoto(jpeg(true)), { error: 'exif' });
const riff = (chunk: string) => { const b = new Uint8Array(30); b.set(new TextEncoder().encode('RIFF\0\0\0\0WEBP' + chunk)); b[16] = 2; return b; };
assert.deepEqual(checkPhoto(riff('VP8 ')), { type: 'image/webp' });
assert.deepEqual(checkPhoto(riff('EXIF')), { error: 'exif' });
assert.deepEqual(checkPhoto(new TextEncoder().encode('<svg onload=alert(1)>')), { error: 'type' });

// Money
assert.equal(cents('12'), 1200); assert.equal(cents('12,5'), 1250); assert.equal(cents('0.05'), 5);
assert.equal(cents('-3'), null); assert.equal(cents('1e3'), null); assert.equal(cents(''), null);
assert.equal(money(1200), '€12'); assert.equal(money(1250), '€12.50');

// AI draft: invalid fields are dropped, text around the JSON is ignored
assert.deepEqual(parseDraft('Sure! {"title":"Red kettle","category":"Home and kitchen","condition":"Mint","description":"Enamel."}'),
  { title: 'Red kettle', category: 'Home and kitchen', condition: '', description: 'Enamel.' });
assert.equal(parseDraft('no json').title, '');

// Signed cookie list
const v = await signList('k', ['a1', 'b2']);
assert.deepEqual(await readList('k', v), ['a1', 'b2']);
assert.deepEqual(await readList('k', v.replace('a1', 'zz')), []);

console.log('check: ok');
