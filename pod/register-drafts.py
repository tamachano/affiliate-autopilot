"""Create approved POD drafts only. Never publish, order, or purchase."""
import base64, hashlib, json, os, sys, urllib.error, urllib.request
from pathlib import Path

def request(method, path, body=None):
    if method not in ('GET','POST') or (method=='POST' and path!='materials'):
        raise ValueError('Operation outside draft registration scope')
    token=os.environ.get('SUZURI_API_TOKEN','').strip()
    if not token: raise RuntimeError('SUZURI_API_TOKEN is not configured')
    req=urllib.request.Request('https://suzuri.jp/api/v1/'+path,
        data=None if body is None else json.dumps(body).encode(),
        headers={'Authorization':'Bearer '+token,'Accept':'application/json','Content-Type':'application/json'},method=method)
    try:
        with urllib.request.urlopen(req,timeout=60) as response:return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'SUZURI HTTP {error.code}; stopped without retry. Response body not logged.') from None
    except (urllib.error.URLError, TimeoutError,ValueError):
        raise RuntimeError('SUZURI response unknown. Stop; inspect saved drafts before retrying.') from None

def payload(spec,item):
    png=base64.b64decode(spec['png_base64'],validate=True)
    if hashlib.sha256(png).hexdigest()!=spec['sha256']:raise ValueError('Print data hash mismatch')
    if not png.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('Print data is not PNG')
    profit=spec['profit']
    if type(profit) is not int or not 0<=profit<=500:raise ValueError('Profit outside approved range')
    variants=[v for v in item.get('variants',[]) if v.get('enabled') and v.get('color',{}).get('name')==spec['variant_color']]
    if spec.get('variant_size'):variants=[v for v in variants if v.get('size',{}).get('name')==spec['variant_size']]
    if not variants:raise ValueError('Approved color/size unavailable; no substitution made')
    variant=next((v for v in variants if v.get('exemplary')),variants[0])
    return {'title':spec['name'],'description':spec['description']+'\n\n'+spec['notice']+'\n\n[POD-AutoPilot:'+spec['id']+']',
        'price':profit,'texture':'data:image/png;base64,'+spec['png_base64'],
        'products':[{'itemId':item['id'],'exemplaryItemVariantId':variant['id'],'published':False,'resizeMode':'contain'}]}

def main():
    specs=json.loads(Path('pod/products-bundle.json').read_text())
    user=request('GET','user').get('user',{})
    if type(user.get('id')) is not int:raise RuntimeError('Authenticated account not verified')
    items=request('GET','items').get('items',[])
    # Check all payloads and all duplicate markers before the first write.
    prepared=[]
    for spec in specs:
        matches=[x for x in items if x.get('name')==spec['api_item_name']]
        if len(matches)!=1:raise RuntimeError('Product type not uniquely resolved')
        prepared.append((spec,payload(spec,matches[0])))
    markers=set();offset=0
    while True:
        data=request('GET',f'materials?userId={user["id"]}&limit=50&offset={offset}')
        for material in data.get('materials',[]):
            desc=material.get('description') or ''
            for spec in specs:
                if '[POD-AutoPilot:'+spec['id']+']' in desc:markers.add(spec['id'])
        if not data.get('meta',{}).get('hasNext'):break
        offset+=50
        if offset>=1000:raise RuntimeError('Duplicate check incomplete; no writes')
    if markers:raise RuntimeError('Existing draft markers found: '+','.join(sorted(markers))+'. No new writes; verify existing drafts first.')
    summary=os.environ.get('GITHUB_STEP_SUMMARY')
    for spec,body in prepared:
        result=request('POST','materials',body)
        products=result.get('products',[])
        if len(products)!=1:raise RuntimeError('Unexpected product count; stop and inspect account. Do not retry.')
        product=products[0]
        if product.get('published') is not False:raise RuntimeError('Draft visibility not confirmed; stop and inspect account immediately.')
        safe={'sku':spec['id'],'material_id':result.get('material',{}).get('id'),'product_id':product.get('id'),'published':False,'price_with_tax':product.get('priceWithTax'),'preview':product.get('sampleImageUrl'),'url':product.get('sampleUrl')}
        print(json.dumps(safe,ensure_ascii=False))
        if summary:
            with open(summary,'a',encoding='utf-8') as out:out.write('```json\n'+json.dumps(safe,ensure_ascii=False,indent=2)+'\n```\n')
    return 0

if __name__=='__main__':
    try:sys.exit(main())
    except (RuntimeError,ValueError) as error:
        print(str(error),file=sys.stderr);sys.exit(1)
