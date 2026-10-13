"""Publish only the three owner-approved products. Never order or change price."""
import json,os,urllib.request,urllib.error
expected={91633664:(21144370,1750),91633667:(21144372,2596),91633668:(21144374,3410)}
token=os.environ['SUZURI_API_TOKEN']
def update(pid,published):
 if pid not in expected or type(published) is not bool:raise ValueError('Outside approved scope')
 req=urllib.request.Request('https://suzuri.jp/api/v1/products/'+str(pid),data=json.dumps({'published':published}).encode(),headers={'Authorization':'Bearer '+token,'Accept':'application/json','Content-Type':'application/json'},method='PUT')
 try:
  with urllib.request.urlopen(req,timeout=45) as r:return json.load(r)['product']
 except urllib.error.HTTPError as e:raise RuntimeError('SUZURI HTTP '+str(e.code)+'; stopped without retry') from None
 except Exception:raise RuntimeError('Response unknown; inspect visibility before retry') from None
def valid(p,pid,published):
 mid,price=expected[pid]
 m=p.get('material',{})
 return p.get('id')==pid and m.get('id')==mid and m.get('user',{}).get('name')=='tamachano_pod' and m.get('violation') is False and p.get('priceWithTax')==price and p.get('published') is published
# All three are preflighted privately before any public write.
for pid in expected:
 p=update(pid,False)
 if not valid(p,pid,False):raise RuntimeError('Preflight mismatch; no publication')
results=[]
for pid in expected:
 p=update(pid,True)
 if not valid(p,pid,True):
  update(pid,False)
  raise RuntimeError('Unexpected published response; product returned to private')
 safe={'product_id':pid,'material_id':expected[pid][0],'published':True,'price_with_tax':p['priceWithTax'],'url':p['sampleUrl']}
 results.append(safe);print(json.dumps(safe,ensure_ascii=False))
 with open(os.environ.get('GITHUB_STEP_SUMMARY','/tmp/pod-summary'),'a') as f:f.write('- '+p['sampleUrl']+' — ¥'+str(p['priceWithTax'])+' / published\n')
print('Published approved products only. No orders or purchases.')
