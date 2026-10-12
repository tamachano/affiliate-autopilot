import fs from 'node:fs';
import path from 'node:path';

export function slugifyJapanese(input: string): string {
  return input.trim().replace(/\s+/g, '-').replace(/[\\/:*?"<>|]/g, '').slice(0, 60) || 'run';
}

export function writeJson(file: string, data: unknown) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

export function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export function todayJst(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function uniqueRunDir(base: string, theme: string): string {
  const stem = `${todayJst()}-${slugifyJapanese(theme)}`;
  let target = path.join(base, stem);
  let i = 2;
  while (fs.existsSync(target)) target = path.join(base, `${stem}-${i++}`);
  ensureDir(target);
  return target;
}
