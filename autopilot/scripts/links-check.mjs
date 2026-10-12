import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const rows=JSON.parse(fs.readFileSync(path.join(repo,'data/products.json'),'utf8'));
for (const p of rows) {
  const u=new URL(p.url);
  if(u.protocol!=='https:'||u.username||u.password) throw Error('Invalid HTTPS link: '+p.id);
  const rakuten=['a.r10.to','r10.to','hb.afl.rakuten.co.jp'].includes(u.hostname);
  const amazon=(u.hostname==='amazon.co.jp'||u.hostname.endsWith('.amazon.co.jp'))&&u.searchParams.get('tag')==='tamama0a-22';
  if(p.provider==='rakuten'?!rakuten:!amazon) throw Error('Invalid affiliate link: '+p.id);
}
console.log('Validated '+rows.length+' affiliate link formats. Merchant destination availability is checked separately.');
