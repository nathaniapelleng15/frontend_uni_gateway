import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const booth = fs.readFileSync(new URL('../components/PhotoBooth.tsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('./apiService.ts', import.meta.url), 'utf8');
const vite = fs.readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
function parse(source) { return ts.createSourceFile(source === api ? 'source.ts' : 'source.tsx', source, ts.ScriptTarget.Latest, true, source === api ? ts.ScriptKind.TS : ts.ScriptKind.TSX); }
function evaluate(text, scope) {
  return vm.runInNewContext(ts.transpileModule(`(${text})`, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText, scope);
}
function initializer(source, name) {
  const ast = parse(source); let value;
  function visit(n) { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name) value = n.initializer.getText(ast); ts.forEachChild(n, visit); }
  visit(ast); assert.ok(value, name); return value;
}
function effects() {
  const ast = parse(booth), found = [];
  function visit(n) { if (ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect') found.push(n.arguments[0].getText(ast)); ts.forEachChild(n, visit); }
  visit(ast); return found;
}

test('required payments cannot be fabricated by a development keyboard shortcut', () => {
  const bypassEffects = effects().filter(text => text.includes('handleDevKey') && text.includes("setVerificationStatus('verified')"));
  assert.equal(bypassEffects.length, 0, 'local testing must still follow Admin payment policy');
});

test('legacy proof remains available without exposing gateway secrets or a browser callback proxy', () => {
  for (const source of [booth, api, vite]) assert.doesNotMatch(source, /DUITKU_API_KEY|payment-verification\/check|merchant_order_id|merchantOrderId/);
  assert.doesNotMatch(vite, /duitku\/callback/);
  assert.match(booth, /I Have Paid/);
  assert.match(booth, /Periksa lewat kamera/);
});

test('startSession preserves supported gateway metadata and normalizes unknown providers without bypassing Admin', async () => {
  for (const method of ['duitku_qris', 'unknown', undefined, 'qris_visual_proof', 'gopay_merchant_polling']) {
    for (const required of [true, undefined, false]) {
      const calls = [];
      const scope = {KioskApiError:Error, request:async options => {
        calls.push(options);
        return {status:200,data:{success:true,session_code:'S',amount:12001,data:{payment_method:method,payment_required:required,
          qris_image_url:'qris.png',payment_url:'https://sandbox.duitku.com/order',payment_environment:'sandbox',merchant_order_id:'OLD',payment_expires_at:'old'}}};
      }};
      const result = await evaluate(initializer(api, 'startSession'), scope)('K', 1, 'digital');
      assert.equal(result.payment_method, ['duitku_qris','gopay_merchant_polling'].includes(method) ? method : 'qris_visual_proof');
      assert.equal(result.payment_required, required !== false);
      assert.equal(result.payment_environment,'sandbox');
      assert.equal(result.payment_expires_at,'old');
      for (const key of ['payment_url','merchant_order_id']) assert.equal(Object.hasOwn(result,key),false,key);
      assert.equal(calls.length,1);
      assert.equal(calls[0].url,'/sessions/start');
    }
  }
});

test('legacy confirmation opens proof scan while Duitku cannot use the manual proof path', () => {
  for (const method of ['duitku_qris','qris_visual_proof','gopay_merchant_polling']) {
  let step;
  const scope = {paymentMethod:method,setStep:value=>{step=value;}};
  for (const name of ['setFlowError','setVerificationStatus','setVerificationReasonCodes','setScanningProgress','setScanningHint']) scope[name] = ()=>{};
  evaluate(initializer(booth,'handlePaymentConfirm'),scope)();
  assert.equal(step,method === 'duitku_qris' ? undefined : 'PAYMENT_SCAN');
  }
});

test('Duitku keeps its session QR and never fetches the static Admin image', async () => {
  const effect = effects().find(text => text.includes('fetchPaymentProfile()'));
  for (const method of ['duitku_qris','qris_visual_proof','gopay_merchant_polling']) {
  let url = 'dynamic-session-qr', calls = 0;
  evaluate(effect,{step:'PAYMENT',paymentMethod:method,setQrisUrl:value=>{url=value;},setQrisLoading:()=>{},
    fetchPaymentProfile:async()=>{calls++;return 'legacy-qris.png';},setFlowError:assert.fail,KioskApiError:Error})();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,method === 'duitku_qris' ? 0 : 1);
  assert.equal(url,method === 'duitku_qris' ? 'dynamic-session-qr' : 'legacy-qris.png');
  }
});

test('Duitku and GoPay enter capture only after the authenticated backend reports verified', async () => {
  const effect = effects().find(text => text.includes('getSessionPaymentStatus(sessionCode)'));
  for (const method of ['duitku_qris','qris_visual_proof','gopay_merchant_polling','unknown']) {
    const calls = []; let step;
    evaluate(effect,{step:'PAYMENT',paymentMethod:method,sessionCode:'S',setPaymentPollingState:()=>{},setFlowError:()=>{},
      setVerificationStatus:()=>{},setStep:value=>{step=value;},getSessionPaymentStatus:async code=>{calls.push(code);return {payment_status:'verified'};},
      window:{setTimeout:()=>assert.fail('verified payment must stop polling'),clearTimeout:()=>{}}})();
    await new Promise(resolve=>setImmediate(resolve));
    const automatic = ['duitku_qris','gopay_merchant_polling'].includes(method);
    assert.deepEqual(calls,automatic ? ['S'] : []);
    assert.equal(step,automatic ? 'CAPTURE' : undefined);
  }
});

test('pending, expired and network failures never unlock the Duitku photo session', async () => {
  const effect = effects().find(text => text.includes('getSessionPaymentStatus(sessionCode)'));
  for (const status of ['pending','expired','rejected','network']) {
    let state, scheduled = 0;
    evaluate(effect,{step:'PAYMENT',paymentMethod:'duitku_qris',sessionCode:'S',setPaymentPollingState:value=>{state=value;},
      setFlowError:()=>{},setVerificationStatus:assert.fail,setStep:assert.fail,
      getSessionPaymentStatus:async()=>{if(status === 'network')throw new Error('offline');return {payment_status:status};},
      window:{setTimeout:()=>{scheduled++;return 1;},clearTimeout:()=>{}}})();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(state,['expired','rejected'].includes(status) ? 'expired' : status === 'network' ? 'retrying' : 'waiting');
    assert.equal(scheduled,['expired','rejected'].includes(status) ? 0 : 1);
  }
});
