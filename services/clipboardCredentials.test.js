import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {parseAdminKioskCredentials,isUsableKioskApiKey} from './kioskApiKey.ts';

const app=fs.readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
function handler(scope){
 const ast=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let expression;
 function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='pasteApiKeyFromClipboard')expression=node.initializer.getText(ast);ts.forEachChild(node,visit);}
 visit(ast);assert.ok(expression,'connection form needs an explicit clipboard action');
 return vm.runInNewContext(ts.transpileModule(`(${expression})`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,{parseAdminKioskCredentials,isUsableKioskApiKey,...scope});
}
function state(clipboard){const result={apiKey:'previous',kioskId:'old',message:''};return {result,scope:{navigator:{clipboard},setApiKeyInput:x=>{result.apiKey=x},setPastedKioskId:x=>{result.kioskId=x},setClipboardMessage:x=>{result.message=x}}};}

test('connection form exposes an explicit non-submit Paste button with visible status',()=>{
 assert.match(app,/<button\s+type="button"\s+onClick=\{pasteApiKeyFromClipboard\}/);
 assert.match(app,/Tempel dari clipboard/);
 assert.match(app,/role="status"[^>]*>\{clipboardMessage\}/);
});

test('clipboard action parses raw keys and multiline Admin bundles without saving or requesting',async()=>{
 for(const [text,key,id] of [['fixture_only','fixture_only',''],['DEVICE_ID=KSK-FIXTURE\nDEVICE_TOKEN=fixture_bundle','fixture_bundle','KSK-FIXTURE']]){
  const {scope,result}=state({readText:async()=>text});await handler(scope)();
  assert.equal(result.apiKey,key);assert.equal(result.kioskId,id);assert.match(result.message,/berhasil ditempel/i);
 }
});

test('denied or unavailable clipboard retains entered credentials and explains keyboard fallback',async()=>{
 for(const clipboard of [undefined,{readText:async()=>{throw new Error('denied')}}]){
  const {scope,result}=state(clipboard);await handler(scope)();
  assert.equal(result.apiKey,'previous');assert.equal(result.kioskId,'old');assert.match(result.message,/Ctrl\+V/);assert.match(result.message,/Cmd\+V/);
 }
});

test('empty or incomplete Admin clipboard never overwrites a valid input',async()=>{
 for(const text of ['','DEVICE_ID=KSK-FIXTURE','DEVICE_TOKEN=']){
  const {scope,result}=state({readText:async()=>text});await handler(scope)();
  assert.equal(result.apiKey,'previous');assert.equal(result.kioskId,'old');assert.match(result.message,/kosong|tidak lengkap/i);
 }
});
