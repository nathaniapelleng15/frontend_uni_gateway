import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {resolvePackagePhotoLayout, paintPrintCameraCrop, assertPrintPhotoGeometryMatches} from './printPhotoGeometry.ts';
const source = readFileSync(new URL('../components/PhotoBooth.tsx', import.meta.url), 'utf8');
function handler(name, scope) {
  const ast = ts.createSourceFile('PhotoBooth.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(initializer, `${name} exists`);
  return vm.runInNewContext(ts.transpileModule(`(${initializer.getText(ast)});`, {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None},
  }).outputText, scope);
}
test('real shutter captures Print canonical box while Digital keeps full processing dimensions', () => {
  for (const selectedPackage of ['print', 'digital']) {
    const calls = [], captured = [];
    const canvas = {width: 1920, height: 1080};
    const ctx = {save(){},restore(){},translate(...args){calls.push(['translate',...args]);},
      scale(...args){calls.push(['scale',...args]);},drawImage(...args){calls.push(args);}};
    const output = {getContext:()=>ctx,toDataURL:()=>`${output.width}x${output.height}`};
    const scope = {selectedPackage, processingCanvasRef:{current:canvas},reviewPhotoIndex:null,
      retakeIndex:null,capturedPhotos:[],candidateCount:2,captureDeadline:null,
      selectedFrame:null,selectedLayoutId:'1x1',printPresentationKey:'fixture',printPhotoLayoutRef:{current:null},
      getCaptureLayoutConfig:()=>resolvePackagePhotoLayout(selectedPackage,{width:728,height:1088,slots:[]}),
      paintPrintCameraCrop,useCallback: fn=>fn,setFlash(){},shutterAudioRef:{current:null},setTimeout(){},
      document:{createElement:()=>output},setCapturedPhotos: fn=>captured.push(...fn([])),
      setCountdown(){},setRetakeIndex(){},setReviewPhotoIndex(){},setIsAutoCapturing(){},setCaptureExpired(){}};
    handler('takePhoto',scope)();
    assert.equal(captured[0], selectedPackage==='print'?'555x567':'1920x1080');
    const draw = calls.at(-1);
    if (selectedPackage==='print') {
      assert.ok(Math.abs(draw[1] - (1920 - 1080 * 555 / 567) / 2) < 1e-9);
      assert.ok(Math.abs(draw[3] - 1080 * 555 / 567) < 1e-9);
      assert.deepEqual([draw[2],...draw.slice(4)],[0,1080,0,0,555,567]);
    }
    else assert.deepEqual(draw,[canvas,0,0]);
  }
});
test('Print capture review stays canonical while compositions, selection and mono retain Admin geometry', () => {
  for (const name of ['generateCompositeImage','getReviewPhotoSlot','getSelectionPhotoSlot','getSelectedPrintPreviewSlot']) {
    const ast = ts.createSourceFile('PhotoBooth.tsx', source, ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    let text='';
    function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)text=n.initializer.getText(ast);ts.forEachChild(n,visit);}
    visit(ast);
    assert.match(text,name === 'getReviewPhotoSlot' ? /getCaptureLayoutConfig/ : /getEffectiveLayoutConfig/, `${name} uses its own geometry contract`);
  }
  assert.match(source,/selectedPackage === 'print'[\s\S]*<PrintCameraPreview/);
});

test('capture thumbnails show the square photo but Admin frame and filter thumbnails keep previous layouts', () => {
  assert.match(source, /data-testid="capture-photo-thumbnail"[\s\S]*?aspectRatio:.*printPresentationConfig\.slots\[0\]/);
  assert.match(source, /data-testid="filter-photo-thumbnail"[\s\S]*?className=\{`group relative aspect-video/);
  assert.doesNotMatch(source, /presentationConfig=\{/);
  assert.match(source, /border: `\$\{Math.max\(1, slotBorder.width \* scaleFactor\)\}/,
    'original Admin frame border stays the same for both packages');
});

test('real print asset painter consumes canonical 555x567 directly, never old portrait layout', async () => {
  const calls = [];
  const image = {naturalWidth:555,naturalHeight:567};
  const ctx = {fillRect:(...args)=>calls.push(['fill',...args]),drawImage:(...args)=>calls.push(['draw',...args])};
  const output = {getContext:()=>ctx,toDataURL:()=>`${output.width}x${output.height}`};
  const {paintPrintImage} = await import('./printImage.ts');
  const fn = handler('generatePrintImage', {
    getEffectiveLayoutConfig:()=>{throw new Error('must not use Digital portrait fallback');},
    loadImageElement:async()=>image,document:{createElement:()=>output},paintPrintImage,console,
  });
  const layout = resolvePackagePhotoLayout('print',{width:728,height:1088,slots:[]});
  assert.equal(await fn('canonical',null,'1x1',0,layout),'555x567');
  assert.deepEqual(calls,[['fill',0,0,555,567],['draw',image,0,0,555,567,0,0,555,567]]);
});

test('real Print display canvas draws the same crop as shutter and guide bounds match its displayed rectangle', () => {
  const text = readFileSync(new URL('../components/PrintCameraPreview.tsx', import.meta.url),'utf8');
  const ast = ts.createSourceFile('PrintCameraPreview.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const declaration = ast.statements.find(ts.isFunctionDeclaration);
  const code = ts.transpileModule(`(function(${declaration.parameters.map(p=>p.getText(ast)).join(',')}) ${declaration.body.getText(ast)});`,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React},
  }).outputText;
  const draws = [], refs = [], effects = [];
  const ctx = {save(){},restore(){},translate(){},scale(){},drawImage:(...args)=>draws.push(args)};
  const source = {width:1920,height:1080};
  const scope = {paintPrintCameraCrop,React:{createElement:(type,props,...children)=>({type,props,children})},
    useRef:()=>{const ref={current:refs.length===0?{clientWidth:800,clientHeight:600}:{getContext:()=>ctx}};refs.push(ref);return ref;},
    useState:()=>[{width:800,height:600},()=>{}],useEffect:fn=>effects.push(fn),
    ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:fn=>{scope.nextFrame=fn;return 1;},cancelAnimationFrame:()=>{}};
  const fn = vm.runInNewContext(code,scope);
  const tree = fn({sourceRef:{current:source},slot:{width:555,height:555}});
  const photoBox = tree.children[0];
  assert.equal(photoBox.props.style.width,600);assert.equal(photoBox.props.style.height,600);
  assert.equal(photoBox.children[0].props.width,555);assert.equal(photoBox.children[0].props.height,555);
  assert.equal(photoBox.children[1].props.id,'print-camera-guide');
  const cleanup = effects.map(fn=>fn());
  scope.nextFrame();
  assert.deepEqual(draws[0].slice(1),[420,0,1080,1080,0,0,555,555]);
  assert.deepEqual(source,{width:1920,height:1080},'display never resizes processing/OCR source');
  cleanup.forEach(fn=>fn?.());
});

test('captured Print geometry stays frozen across polling while Digital ignores the lock',()=>{
  const captured=resolvePackagePhotoLayout('print',{width:1,height:1,slots:[]});
  const digital={width:708,height:1062,slots:[{x:40,y:60,width:628,height:782}]};
  const scope={selectedPackage:'print',printPhotoLayoutRef:{current:captured},
    getLivePrintLayoutConfig:()=>{throw Error('must not recrop captured photos');},getEffectiveLayoutConfig:()=>digital};
  assert.equal(handler('getCaptureLayoutConfig',scope)(null,'1x1'),captured);
  assert.equal(handler('getCaptureLayoutConfig',{...scope,selectedPackage:'digital'})(null,'1x1'),digital);
});
test('real print guard refuses unavailable or changed geometry without touching calibration',()=>{
  const captured=resolvePackagePhotoLayout('print',{width:1,height:1,slots:[]});
  const scope={hasPrintGeometrySettings:true,printPhotoLayoutRef:{current:captured},
    processedFrame:null,selectedFrame:null,selectedLayoutId:'1x1',assertPrintPhotoGeometryMatches,
    getLivePrintLayoutConfig:()=>structuredClone(captured)};
  handler('assertPrintPhotoGeometryCurrent',scope)();
  assert.throws(()=>handler('assertPrintPhotoGeometryCurrent',{...scope,hasPrintGeometrySettings:false})(),/belum tersedia/);
  assert.throws(()=>handler('assertPrintPhotoGeometryCurrent',{...scope,getLivePrintLayoutConfig:()=>({...captured,height:792})})(),/ukuran Niimbot berubah/);
  assert.deepEqual(captured.slots,[{x:0,y:59,width:555,height:567}]);
});
