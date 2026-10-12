'use strict';
// Compare the deployed bytes, including every affiliate link, with this build.
// This does not prove the merchant destination exists or image rights are cleared.
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const base = new URL(process.env.SITE_URL || 'https://jinsei-no-sitsu.quality-life.workers.dev/');
if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) {
  throw Error('Verification requires HTTPS');
}
const files = ['index.html', 'products.js', 'site.js', 'brand-icon.webp'];
async function verify() {
  const attempts = Number(process.env.VERIFY_ATTEMPTS || 6);
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 12) throw Error('Invalid attempts');
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      for (const file of files) {
        const url = new URL(file === 'index.html' ? './' : file, base);
        url.searchParams.set('verify', `${process.env.GITHUB_SHA || 'local'}-${Date.now()}`);
        const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw Error(`${file}: HTTP ${response.status}`);
        const actual = Buffer.from(await response.arrayBuffer());
        const expected = fs.readFileSync(path.join(__dirname, '..', 'public', file));
        if (!actual.equals(expected)) throw Error(`${file}: deployed content does not match this build`);
      }
      console.log(`Verified all ${files.length} production assets and product links match this build.`);
      return;
    } catch (error) {
      console.error(`Verification ${attempt}/${attempts}: ${error.message}`);
      if (attempt === attempts) throw error;
      await delay(10000);
    }
  }
}
verify().catch(() => { process.exitCode = 1; });
