(() => {
  const root = document.getElementById('items');
  const count = document.getElementById('count');
  const products = Array.isArray(window.PRODUCTS) ? window.PRODUCTS.filter(p => p.enabled !== false) : [];
  products.sort((a,b) => (b.publishedAt || '').localeCompare(a.publishedAt || '') || String(b.id).localeCompare(String(a.id)));
  count.textContent = `${products.length}点`;
  root.replaceChildren();
  if (!products.length) { const p=document.createElement('p'); p.className='empty'; p.textContent='現在、紹介している商品はありません。'; root.append(p); return; }
  for (const p of products) {
    const card = document.createElement('article'); card.className='card'; card.id=`product-${p.id}`;
    const meta = document.createElement('p'); meta.className='meta'; meta.textContent=`商品 No.${p.id}`;
    const name = document.createElement('h3'); name.className='name'; name.textContent=p.name;
    const desc = document.createElement('p'); desc.className='desc'; desc.textContent=p.description || '';
    card.append(meta,name,desc);
    let safe = null;
    let provider = p.provider === 'rakuten' ? 'rakuten' : 'amazon';
    try {
      const u = new URL(p.url || '');
      if (u.protocol === 'https:') {
        const h = u.hostname.toLowerCase();
        if (provider === 'amazon' && (h === 'amazon.co.jp' || h.endsWith('.amazon.co.jp'))) safe=u.href;
        if (provider === 'rakuten' && (h === 'a.r10.to' || h === 'hb.afl.rakuten.co.jp' || h === 'r10.to')) safe=u.href;
      }
    } catch {}
    if (safe) {
      const a=document.createElement('a'); a.className='action'; a.href=safe;
      a.target='_blank'; a.rel='noopener noreferrer sponsored';
      a.textContent=provider === 'rakuten' ? '楽天で商品を見る ↗' : 'Amazonで商品を見る ↗'; card.append(a);
    } else { const pending=document.createElement('span'); pending.className='pending'; pending.textContent='商品リンク準備中'; card.append(pending); }
    root.append(card);
  }
})();
