// Shelfring client script: photo preparation and upload, AI draft, link preview image, carousel, share, push.
// Plain JavaScript, no framework. Pages work without it, except photo upload.
(() => {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s), $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const post = (url, body, headers) => fetch(url, { method: 'POST', body, headers, credentials: 'same-origin' });

  /* ---------- photos: the browser makes the sizes and drops EXIF (also GPS) by re-encoding ---------- */
  const encode = c => new Promise(ok => c.toBlob(b => b && b.type === 'image/webp' ? ok(b) : c.toBlob(ok, 'image/jpeg', .82), 'image/webp', .82));
  async function prepare(file) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const out = {};
    for (const [name, edge] of [['l', 1600], ['s', 800]]) {
      const k = Math.min(1, edge / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, c.width, c.height);
      out[name] = await encode(c);
      if (name === 'l') { out.w = c.width; out.h = c.height; }
    }
    // average colour: the placeholder until the photo arrives
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const x = c.getContext('2d'); x.drawImage(bmp, 0, 0, 16, 16);
    const d = x.getImageData(0, 0, 16, 16).data, sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
    out.avg = '#' + sum.map(v => Math.round(v / 256).toString(16).padStart(2, '0')).join('').toUpperCase();
    bmp.close();
    return out;
  }
  async function upload(file, target) {
    const p = await prepare(file), f = new FormData();
    f.append('l', p.l, 'l'); f.append('s', p.s, 's'); f.append('w', p.w); f.append('h', p.h); f.append('avg', p.avg); f.append('target', target);
    const r = await post('/api/photo', f), j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Upload failed. Try again.');
    return { ...j, w: p.w, h: p.h, avg: p.avg };
  }
  const say = (el, t) => { if (el) el.textContent = t; };
  const cantRead = 'This photo cannot be read here. Try another photo, or take it again with the camera.';

  /* ---------- sell form ---------- */
  const sell = $('[data-sell]');
  if (sell) {
    const grid = $('[data-photos]', sell), add = $('[data-add]', sell), msg = $('[data-photo-msg]', sell), ai = $('[data-ai]', sell);
    const count = () => $$('.pick', grid).length;
    const refresh = () => {
      $$('.pick', grid).forEach((f, i) => { f.classList.toggle('cover', i === 0); $('.cover-chip', f)?.remove(); if (i === 0) f.insertAdjacentHTML('beforeend', '<span class="chip cover-chip">Cover</span>'); $('.ph img', f).alt = `Photo ${i + 1}`; });
      add.hidden = count() >= 5;
      $('.art', sell)?.remove();
      say(msg, count() > 1 ? 'Tap a photo to make it the cover.' : '');
    };
    let drafted = !!$('[name=title]', sell).value;
    async function draft() {
      if (drafted) return; drafted = true;
      say(ai, 'Writing a draft from your photos…');
      const d = await post('/api/draft-ai').then(r => r.json()).catch(() => ({}));
      let n = 0;
      for (const k of ['title', 'category', 'condition', 'description']) { const el = $(`[name=${k}]`, sell); if (d[k] && !el.value) { el.value = d[k]; n++; } }
      say(ai, n ? 'Draft ready. Check the text before you publish.' : 'No draft this time. Write a short text yourself.');
    }
    $('[data-file]', sell).addEventListener('change', async ev => {
      const files = [...ev.target.files].slice(0, 5 - count()); ev.target.value = '';
      for (const file of files) {
        const fig = document.createElement('figure'); fig.className = 'pick up';
        fig.innerHTML = '<span class="ph r45"><img alt=""></span>';
        const url = URL.createObjectURL(file); $('img', fig).src = url;
        grid.insertBefore(fig, add); refresh();
        try {
          const p = await upload(file, 'listing');
          fig.dataset.key = p.key; fig.classList.remove('up'); $('.ph', fig).style.setProperty('--avg', p.avg);
          fig.insertAdjacentHTML('beforeend', '<button type="button" class="x" data-del aria-label="Remove photo"><svg class="ico" aria-hidden="true"><use href="/icons.svg#x"/></svg></button>');
        } catch (e) { fig.remove(); say(msg, e instanceof Error && !/decode|source|image/i.test(e.message) ? e.message : cantRead); }
        refresh();
      }
      if (count()) draft();
    });
    grid.addEventListener('click', async ev => {
      const fig = ev.target.closest('.pick'); if (!fig || !fig.dataset.key) return;
      if (ev.target.closest('[data-del]')) {
        if ((await post(`/api/photo/${fig.dataset.key}/delete`)).ok) { fig.remove(); refresh(); }
      } else if (fig !== grid.firstElementChild && (await post(`/api/photo/${fig.dataset.key}/first`)).ok) { grid.prepend(fig); refresh(); }
    });
    // the link preview image: the whole first photo on paper, with the pen frame, the price and the site name
    sell.addEventListener('submit', async ev => {
      const first = $('.pick[data-key]', grid); if (!first || sell.dataset.og === 'done') return;
      ev.preventDefault(); sell.dataset.og = 'done';
      const btn = $('[data-publish]', sell); btn.disabled = true; btn.textContent = 'Publishing…';
      try {
        const amount = $('[name=price]', sell).value.trim().replace(',', '.'), sym = $('.money span', sell).textContent;
        const label = (sell.mode.value === 'auction' ? 'from ' : '') + sym + amount;
        const blob = await compose(`/img/${first.dataset.key}/l`, label, document.body.dataset.site);
        await post('/api/og', blob, { 'Content-Type': blob.type });
      } catch (e) { console.warn('preview image', e); }
      sell.submit();
    });
  }
  async function compose(src, price, site) {
    const img = new Image(); img.src = src; await img.decode();
    await document.fonts.load('800 50px "Shantell Sans"');
    const W = 1200, H = 630, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#FDFDFB'; x.fillRect(0, 0, W, H); x.fillStyle = '#D3D8E3';
    for (let yy = 15; yy < H; yy += 30) for (let xx = 15; xx < W; xx += 30) { x.beginPath(); x.arc(xx, yy, 2.2, 0, Math.PI * 2); x.fill(); }
    const s = Math.min(900 / img.naturalWidth, 540 / img.naturalHeight), w = img.naturalWidth * s, h = img.naturalHeight * s, px = (W - w) / 2, py = (H - h) / 2;
    x.save(); x.beginPath(); x.roundRect(px, py, w, h, 14); x.clip(); x.drawImage(img, px, py, w, h); x.restore();
    x.strokeStyle = '#1F2233'; x.lineWidth = 3.6; x.beginPath(); x.roundRect(px - 7, py - 7, w + 14, h + 14, 18); x.stroke();
    x.font = '800 54px "Shantell Sans", sans-serif'; x.textBaseline = 'middle';
    const tw = x.measureText(price).width, tx = px - 26, th = 78, ty = py + h - th - 22;
    x.fillStyle = '#FFE34F'; x.beginPath(); x.roundRect(tx, ty, tw + 48, th, [10, 14, 9, 12]); x.fill();
    x.fillStyle = '#1F2233'; x.fillText(price, tx + 24, ty + th / 2 + 3);
    x.font = '800 34px "Shantell Sans", sans-serif'; x.textAlign = 'right'; x.fillText(site, W - 34, H - 36);
    return new Promise(ok => c.toBlob(ok, 'image/jpeg', .86));
  }

  /* ---------- profile photo and cover ---------- */
  $$('label[data-target] [data-file]').forEach(input => input.addEventListener('change', async () => {
    const msg = $('[data-photo-msg]'), file = input.files[0]; input.value = '';
    if (!file) return;
    say(msg, 'Uploading…');
    try { await upload(file, input.closest('[data-target]').dataset.target); say(msg, 'Saved.'); }
    catch (e) { say(msg, e instanceof Error && !/decode|source|image/i.test(e.message) ? e.message : cantRead); }
  }));

  /* ---------- listing photos: swipe, or tap a thumbnail ---------- */
  const track = $('[data-track]');
  if (track) {
    const thumbs = $$('[data-thumb]'), count = $('[data-count]');
    const show = i => { thumbs.forEach((t, k) => t.setAttribute('aria-current', k === i ? 'true' : 'false')); if (count) count.textContent = `${i + 1} / ${thumbs.length}`; };
    thumbs.forEach((t, i) => t.addEventListener('click', () => { track.scrollTo({ left: i * track.clientWidth }); show(i); }));
    let raf = 0;
    track.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => show(Math.round(track.scrollLeft / track.clientWidth))); }, { passive: true });
  }

  /* ---------- share: the phone's share sheet, or copy the link ---------- */
  $$('[data-share]').forEach(b => b.addEventListener('click', async () => {
    const data = { title: b.dataset.title, url: b.dataset.share };
    if (navigator.share) { try { await navigator.share(data); } catch { /* closed by the user */ } return; }
    try { await navigator.clipboard.writeText(data.url); const t = b.innerHTML; b.textContent = 'Link copied'; setTimeout(() => { b.innerHTML = t; }, 2000); }
    catch { prompt('Copy the link:', data.url); }
  }));

  /* ---------- menu: closes on a click outside or on Escape ---------- */
  const menu = $('.menu');
  if (menu) {
    document.addEventListener('click', e => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.open) { menu.open = false; $('summary', menu).focus(); } });
  }

  /* ---------- web push ---------- */
  const vapid = document.body.dataset.vapid;
  const canPush = !!vapid && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const key = () => Uint8Array.from(atob(vapid.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
  async function subscribe(who) {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key() });
    return (await post('/api/push?for=' + who, JSON.stringify(sub), { 'Content-Type': 'application/json' })).ok;
  }
  const sellerBtn = $('[data-push=seller]');
  if (sellerBtn && canPush) {
    sellerBtn.hidden = false;
    const on = () => { sellerBtn.disabled = true; sellerBtn.lastChild.textContent = 'Notifications are on'; };
    if (Notification.permission === 'granted') navigator.serviceWorker.getRegistration('/sw.js').then(r => r?.pushManager.getSubscription()).then(s => s && on());
    sellerBtn.addEventListener('click', async () => { try { if (await subscribe('seller')) on(); } catch { sellerBtn.lastChild.textContent = 'Notifications are blocked in this browser'; } });
  } else if (sellerBtn && /iP(hone|ad)/.test(navigator.userAgent) && !navigator.standalone) $('[data-push-ios]').hidden = false;
  const req = $('[data-req]');
  if (req && canPush) {
    $('[data-push-opt]', req).hidden = false;
    req.addEventListener('submit', async ev => {
      if (!req.push.checked || req.dataset.sub) return;
      ev.preventDefault(); req.dataset.sub = '1';
      try { await subscribe('buyer'); } catch { /* the request still goes out */ }
      req.submit();
    });
  }
})();
