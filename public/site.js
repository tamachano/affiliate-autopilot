(() => {
  const root = document.getElementById('items');
  const count = document.getElementById('count');
  const products = Array.isArray(window.PRODUCTS) ? window.PRODUCTS.filter(p => p.enabled !== false) : [];
  products.sort((a,b) => (b.publishedAt || '').localeCompare(a.publishedAt || '') || String(b.id).localeCompare(String(a.id)));
  count.textContent = `${products.length}点`;
  root.replaceChildren();
  const make = (tag, cls, text) => { const el=document.createElement(tag); if(cls)el.className=cls; if(text)el.textContent=text; return el; };
  const videoLink = (video, cls, text) => { const a=make('a',cls,text); a.href=`https://www.youtube.com/shorts/${video.id}`; a.target='_blank'; a.rel='noopener noreferrer'; return a; };
  if (!products.length) { root.append(make('p','empty','現在、紹介している商品はありません。')); return; }
  const collections = new Map();
  for (const p of products) {
    if (p.collection && /^[a-z0-9-]{1,80}$/.test(p.collection.id || '') && typeof p.collection.title === 'string') {
      if (!collections.has(p.collection.id)) {
        const section=make('section','collection'); section.id=p.collection.id;
        section.setAttribute('aria-labelledby',`${p.collection.id}-title`);
        section.append(make('p','collection-label','この動画で紹介する5商品'));
        const title=make('h2','collection-title',p.collection.title);title.id=`${p.collection.id}-title`;section.append(title);
        section.append(make('p','collection-note','価格・割引率は2026/10/16〜17の確認画像時点。現在の価格・在庫・適用条件はAmazonでご確認ください。'));
        const list=make('div','collection-items');section.append(list);root.append(section);collections.set(p.collection.id,list);
      }
    }
  }
  let past=null;
  for (const p of products) {
    const card=make('article','card'); card.id=`product-${p.id}`;
    const videos=(Array.isArray(p.videos)?p.videos:[]).filter(v=>v && /^[A-Za-z0-9_-]{11}$/.test(v.id||'') && typeof v.title==='string' && v.title.trim());
    const body=make('div','card-body');
    body.append(make('p','meta',`商品 No.${p.id}`));
    if (videos.length) {
      const content=make('div','card-content');
      const hero=videos[0]; const thumb=videoLink(hero,'thumbnail'); thumb.setAttribute('aria-label',`${hero.title} をYouTubeで見る`);
      const img=make('img'); img.alt=`「${hero.title}」のサムネイル`; img.width=405; img.height=720; img.loading='lazy'; img.decoding='async';
      let thumbnail=null;
      try { const u=new URL(hero.thumbnailUrl); if(u.protocol==='https:' && u.hostname==='i.ytimg.com' && !u.username && !u.password && u.pathname.startsWith(`/vi/${hero.id}/`))thumbnail=u.href; } catch {}
      if(thumbnail) { img.src=thumbnail; img.addEventListener('error',()=>{ img.remove(); thumb.classList.add('thumbnail-unavailable'); }); thumb.append(img); }
      const title=make('h3','video-title'); title.append(videoLink(hero,'',hero.title));
      body.append(title,make('p','product-name',p.name),make('p','desc',p.description||''));
      content.append(thumb,body);card.append(content);
    } else {
      if(p.rank)body.append(make('p','rank',`動画の第${p.rank}位`));
      body.append(make('h3','name',p.name),make('p','desc',p.description||''));
      let image=null;
      try { const u=new URL(p.imageUrl);if(u.protocol==='https:' && u.hostname==='m.media-amazon.com' && u.pathname.startsWith('/images/I/') && !u.username && !u.password)image=u.href; } catch {}
      if(image) {
        const content=make('div','photo-content');const img=make('img','product-photo');img.src=image;img.alt=p.name;img.width=360;img.height=300;img.loading='lazy';img.decoding='async';
        img.addEventListener('error',()=>{img.remove();content.classList.add('photo-unavailable');});content.append(img,body);card.append(content);
      } else card.append(body);
    }
    const actions=make('div','actions'); let safe=null;
    const provider=p.provider==='rakuten'?'rakuten':'amazon';
    try {
      const u=new URL(p.url||''); const h=u.hostname.toLowerCase();
      if(u.protocol==='https:' && !u.username && !u.password && ((provider==='amazon' && (h==='amazon.co.jp'||h.endsWith('.amazon.co.jp'))) || (provider==='rakuten' && ['a.r10.to','r10.to','hb.afl.rakuten.co.jp'].includes(h))))safe=u.href;
    } catch {}
    if(safe) { const a=make('a','action',provider==='rakuten'?'楽天で商品を見る ↗':'Amazonで商品を見る ↗');a.href=safe;a.target='_blank';a.rel='noopener noreferrer sponsored';actions.append(a); }
    else actions.append(make('span','pending','商品リンク準備中'));
    if(videos.length)actions.append(videoLink(videos[0],'watch-link','動画を見る ↗'));
    body.append(actions);
    if(videos.length>1) { const other=make('div','other-videos');other.append(make('p','','この商品のほかの紹介動画')); for(const video of videos.slice(1))other.append(videoLink(video,'',video.title));card.append(other); }
    const list=p.collection && collections.get(p.collection.id);
    if(list)list.append(card);
    else {
      if(!past){past=make('section','past-items');past.append(make('h2','past-title','これまでの紹介動画'));root.append(past);}
      past.append(card);
    }
  }
})();
