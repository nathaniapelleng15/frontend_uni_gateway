import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('printer status uses the authenticated kiosk API and propagates failures', async () => {
  const source = readFileSync(new URL('./apiService.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('apiService.ts', source, ts.ScriptTarget.Latest, true);
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'reportPrinterStatus') initializer = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(initializer);
  let captured;
  const run = vm.runInNewContext(ts.transpileModule(`(${initializer})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
    { request: async options => { captured = options; } });
  const data = { status: 'READY', printer_name: 'B1 Pro', paper_status: null, last_error: null };
  await run(data);
  assert.equal(captured.method, 'POST');
  assert.equal(captured.url, '/printer-status');
  assert.equal(captured.data, data);
  const fail = vm.runInNewContext(ts.transpileModule(`(${initializer})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
    { request: async () => { throw new Error('HTTP 401'); } });
  await assert.rejects(fail(data), /HTTP 401/);
});
