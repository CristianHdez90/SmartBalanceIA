import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createClient } from '@libsql/client';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(path, dependencies = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const loadedModule = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(name => dependencies[name] ?? require(name), loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const domain = load('src/domain/goals.ts');
const { FinancialGoalsRepository } = load('src/infrastructure/financial-goals.ts', { '../domain/goals': domain });
const origin = load('src/infrastructure/request-origin.ts');
const makeGoal = () => ({ action: 'create', id: crypto.randomUUID(), name: 'Viaje de prueba', target: 8000000, saved: 3200000, dueDate: '2026-12-31', icon: 'travel', color: 'indigo' });

async function fixture() {
  const client = createClient({ url: ':memory:' });
  await client.execute('CREATE TABLE users(id TEXT PRIMARY KEY)');
  await client.execute("INSERT INTO users VALUES ('alice'),('bob')");
  const sql = readFileSync(new URL('../drizzle/0011_financial_goals.sql', import.meta.url), 'utf8');
  await client.batch(sql.split(/-->\s*statement-breakpoint/).filter(s => s.trim()), 'write');
  const db = { prepare(sql, args = []) {
    return { bind(...args) { return db.prepare(sql, args); },
      async all() { const result = await client.execute({ sql, args }); return { results: result.rows.map(row => ({ ...row })), meta: { changes: result.rowsAffected } }; },
      async run() { return this.all(); } };
  } };
  return { db, client, alice: new FinancialGoalsRepository(db, 'alice'), bob: new FinancialGoalsRepository(db, 'bob') };
}

test('validates amounts, actual calendar dates and rejects injected ownership', () => {
  const input = makeGoal();
  assert.equal(domain.goalCommand.parse(input).name, input.name);
  for (const invalid of [{ target: 0 }, { saved: -1 }, { saved: 1.5 }, { target: 1e15 }, { dueDate: '2026-02-30' }, { icon: 'unknown' }, { userId: 'bob' }, { name: ' ' }]) {
    assert.equal(domain.goalCommand.safeParse({ ...input, ...invalid }).success, false, JSON.stringify(invalid));
  }
  assert.deepEqual(domain.goalProgress({ saved: 900, target: 800 }), { percent: 100, remaining: 0, complete: true });
  assert.deepEqual(domain.goalProgress({ saved: 799, target: 800 }), { percent: 99, remaining: 1, complete: false });
});

test('persists progress, isolates accounts, rejects stale writes and supports reversible archive', async () => {
  const { client, alice, bob } = await fixture();
  try {
    const input = domain.goalCommand.parse(makeGoal());
    await alice.execute(input);
    assert.equal((await alice.list())[0].saved, 3200000);
    assert.deepEqual(await bob.list(), []);
    const update = { ...input, action: 'update', version: 1, saved: 3500000 };
    await assert.rejects(bob.execute(update), domain.GoalConflictError);
    await assert.rejects(bob.execute({ ...input, name: 'Intrusión' }), domain.GoalConflictError);
    await alice.execute(update);
    await assert.rejects(alice.execute(update), domain.GoalConflictError);
    assert.equal((await alice.list())[0].saved, 3500000);
    await assert.rejects(bob.execute({ action: 'archive', id: input.id, version: 2, archived: true }), domain.GoalConflictError);
    await alice.execute({ action: 'archive', id: input.id, version: 2, archived: true });
    assert.equal((await alice.list())[0].archived, 1);
    await assert.rejects(alice.execute({ ...update, version: 3 }), domain.GoalConflictError);
    await alice.execute({ action: 'archive', id: input.id, version: 3, archived: false });
    assert.equal((await alice.list())[0].archived, 0);
    const concurrent = await Promise.allSettled([alice.execute({ ...update, version: 4, saved: 4000000 }), alice.execute({ ...update, version: 4, saved: 4500000 })]);
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((await alice.list())[0].version, 5);
  } finally { client.close(); }
});

test('route enforces authentication, origin, validation and session ownership', async () => {
  const { db, client } = await fixture();
  class AuthError extends Error { constructor() { super('Sesión requerida'); this.status = 401; } }
  class DatabaseError extends Error {}
  class D1AuthRepository { async requireUser(request) { const user = request.headers.get('x-test-user'); if (!['alice', 'bob'].includes(user)) throw new AuthError(); return { id: user }; } }
  const route = load('app/api/goals/route.ts', {
    '@/src/domain/goals': domain, '@/src/infrastructure/financial-goals': { FinancialGoalsRepository },
    '@/src/infrastructure/d1-auth': { AuthError, D1AuthRepository }, '@/src/infrastructure/database': { database: () => db, DatabaseError },
    '@/src/infrastructure/request-origin': origin,
  });
  const request = (user, body, origin = 'http://localhost:8787') => new Request('http://localhost:8787/api/goals', { method: body ? 'POST' : 'GET', headers: { ...(user ? { 'x-test-user': user } : {}), origin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    assert.equal((await route.GET(request())).status, 401);
    assert.equal((await route.POST(request(null, makeGoal()))).status, 401);
    assert.equal((await route.POST(request('alice', makeGoal(), 'https://untrusted.example'))).status, 403);
    assert.equal((await route.POST(request('alice', { ...makeGoal(), userId: 'bob' }))).status, 400);
    assert.equal((await route.POST(request('alice', makeGoal()))).status, 200);
    const response = await route.GET(request('bob'));
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual((await response.json()).goals, []);
    assert.equal((await (await route.GET(request('alice'))).json()).goals.length, 1);
  } finally { client.close(); }
});
