"""Read-only verification of exactly the three approved SUZURI products."""
import json,os,urllib.request,urllib.error
from pathlib import Path
from urllib.parse import urlparse
expected={91633664:(21144370,1750),91633667:(21144372,2596),91633668:(21144374,3410)}
root=Path('pod-review');root.mkdir(exist_ok=True)
token=os.environ['SUZURI_API_TOKEN']
def get(path):
 req=urllib.request.Request('https://suzuri.jp/api/v1/'+path,headers={'Authorization':'Bearer '+token,'Accept':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=45) as r:return json.load(r)
 except urllib.error.HTTPError as e:raise RuntimeError('SUZURI HTTP '+str(e.code)) from None
report=[]
listed=get('products?userName=tamachano_pod&limit=50').get('products',[])
print('Owner product list count: '+str(len(listed)))
for pid,(mid,price) in expected.items():
 matches=[p for p in listed if p.get('id')==pid]
 if len(matches)!=1:raise RuntimeError('Private product not exposed by read API: '+str(pid))
 p=matches[0]
 m=p['material']
 if p['id']!=pid or m['id']!=mid or m['user']['name']!='tamachano_pod':raise RuntimeError('Ownership mismatch')
 if m.get('violation'):raise RuntimeError('Platform violation flag')
 if p['priceWithTax']!=price:raise RuntimeError('Price changed')
 u=p['sampleImageUrl'];parts=urlparse(u)
 if parts.scheme!='https' or parts.hostname not in ('lens.suzuri.jp','lens2.suzuri.jp'):raise RuntimeError('Unexpected image host')
 try:
  with urllib.request.urlopen(u,timeout=45) as r:data=r.read(4000000)
 except Exception:raise RuntimeError('Preview download failed; URL not logged') from None
 if not data or len(data)>=4000000:raise RuntimeError('Invalid preview size')
 (root/(str(pid)+'.img')).write_bytes(data)
 row={'product_id':pid,'material_id':mid,'published':p['published'],'price_with_tax':p['priceWithTax'],'url':p['sampleUrl'],'violation':m.get('violation',False)}
 report.append(row)
(root/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False))
