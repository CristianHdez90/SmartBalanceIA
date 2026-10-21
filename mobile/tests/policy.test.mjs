import test from 'node:test';
import assert from 'node:assert/strict';
import { isAppUrl, isExternalUrl, parseExport } from '../src/policy.ts';

test('only the production origin is trusted', () => {
  assert.equal(isAppUrl('https://smart-balance-ia.vercel.app/api/backup'), true);
  for (const url of ['http://smart-balance-ia.vercel.app/', 'https://smart-balance-ia.vercel.app.evil.com/', 'javascript:alert(1)', 'file:///tmp/a']) assert.equal(isAppUrl(url), false);
});
test('external links reject unsafe schemes and credentials', () => {
  assert.equal(isExternalUrl('https://example.com'), true);
  for (const url of ['javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com', 'file:///tmp/a']) assert.equal(isExternalUrl(url), false);
});
test('exports restrict filenames, payloads and size', () => {
  const valid = { type: 'mi-balance-export', id: 'abc-123', filename: 'mi-balance-2026-10.sql', base64: 'U0VMRUNUIDE7' };
  assert.equal(parseExport(JSON.stringify(valid)).mimeType, 'application/sql');
  for (const patch of [{ filename: '../secret.sql' }, { filename: 'mi-balance.exe' }, { id: '../x' }, { base64: 'not base64!' }, { type: 'execute-sql' }]) assert.throws(() => parseExport(JSON.stringify({ ...valid, ...patch })));
  assert.throws(() => parseExport('x'.repeat(12_000_001)));
});
