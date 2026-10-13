"""Read-only SUZURI connection check. No product writes, orders or purchases."""
import json
import os
import sys
import urllib.request
import urllib.error

def main():
    token = os.environ.get('SUZURI_API_TOKEN', '').strip()
    if not token:
        print('SUZURI_API_TOKEN is not configured; no API calls made.')
        return 1
    def get(path):
        request = urllib.request.Request('https://suzuri.jp/api/v1/' + path,
            headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/json'}, method='GET')
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            # Do not output server bodies, credentials, profile data or request headers.
            raise RuntimeError('SUZURI connection failed: HTTP ' + str(error.code)) from None
        except (urllib.error.URLError, TimeoutError, ValueError):
            raise RuntimeError('SUZURI connection failed; no response data logged.') from None
    user = get('user').get('user', {})
    if not isinstance(user.get('id'), int):
        raise RuntimeError('SUZURI returned no valid authenticated user.')
    items = get('items').get('items', [])
    wanted = {'flat-pouch', 'mug', 'tote-bag'}
    selected = [{'id': x.get('id'), 'name': x.get('name'), 'display_name': x.get('humanizeName')}
                for x in items if x.get('name') in wanted]
    summary = {'authenticated': True, 'account_name': user.get('name'),
               'mode': 'read_only', 'products_created': 0, 'items': selected}
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    path = os.environ.get('GITHUB_STEP_SUMMARY')
    if path:
        with open(path, 'a', encoding='utf-8') as file:
            file.write('## SUZURI connection check\n\nAuthenticated successfully. '
                       'Read-only check: no products registered, published, ordered or purchased.\n')
    return 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
