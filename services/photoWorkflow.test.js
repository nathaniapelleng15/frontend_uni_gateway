import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../components/PhotoBooth.tsx', import.meta.url), 'utf8');
const apiSource = fs.readFileSync(new URL('./apiService.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('PhotoBooth.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function initializer(name) {
  let found;
  function visit(n) { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name) found = n.initializer; ts.forEachChild(n, visit); }
  visit(ast); assert.ok(found, name + ' must exist'); return found;
}
function handler(name, scope) {
  return vm.runInNewContext(ts.transpileModule(`(${initializer(name).getText(ast)});`, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText, scope);
}
function stateScope(extra = {}) {
  const state = {};
  const scope = {state, ...extra};
  function visit(n) { if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text.startsWith('set')) scope[n.expression.text] = value => { state[n.expression.text] = typeof value === 'function' ? value(state[n.expression.text]) : value; }; ts.forEachChild(n, visit); }
  visit(ast); return scope;
}
test('layout policy allows exactly one Print strip and one/two/three Digital slots before creating a paid session', async () => {
  const getEffectiveLayoutConfig = (style, id) => ({slots: Array(style?.count ?? Number(id[0])).fill({})});
  const frames = ['1x1','2x1','3x1','4x1'].map(id => ({id, enabled:true, styles:[{id:1}]}));
  for (const pkg of ['print','digital']) {
    const scope = stateScope({selectedPackage:pkg, frames, allowedLayouts:[], getEffectiveLayoutConfig});
    const eligible = handler('isWorkflowLayoutAllowed', scope);
    assert.equal(eligible('1x1'), true);
    assert.equal(eligible('2x1'), pkg === 'digital');
    assert.equal(eligible('3x1'), pkg === 'digital');
    assert.equal(eligible('4x1'), false);
    scope.isWorkflowLayoutAllowed = eligible;
    await handler('handleLayoutSelect', scope)('4x1');
    assert.equal(scope.state.setSelectedLayoutId, undefined, 'invalid layout must not create session or touch payment');
    scope.allowedLayouts = ['2x1'];
    assert.equal(eligible('1x1'), false);
    scope.allowedLayouts = [];
    frames[0].styles[0].count = 4;
    assert.equal(eligible('1x1'), false, 'custom Admin slot count must match promised output');
    delete frames[0].styles[0].count;
  }
});

test('selection requires exactly one photo per strip before Edit and Result, keeping candidates separate', () => {
  for (const count of [1,2,3]) {
    const candidates = Array.from({length:count*2},(_,i)=>`candidate-${i}`);
    const scope = stateScope({step:'PRINT_SELECTION', selectedPackage:count===1?'print':'digital', outputCount:count,
      candidateCount:count*2, capturedPhotos:candidates, selectedPrintPhotoIndex:1, selectedPhotoIndices:[], printActionInFlightRef:{current:false},
      isPrintActive:false, btPrintState:'idle', printSelectionConfirmed:false, window:{innerWidth:1000}});
    const confirm = handler('handleConfirmPrintSelection',scope);
    for (const invalid of [[],Array(count+1).fill(0),...(count > 1 ? [Array(count).fill(0)] : []),Array.from({length:count},(_,i)=>i===0?99:i)]) {
      scope.selectedPhotoIndices=invalid; confirm(); assert.equal(scope.state.setStep,undefined);
    }
    scope.selectedPhotoIndices=Array.from({length:count},(_,i)=>i*2+1); confirm();
    assert.equal(scope.state.setStep,'EDIT');
    assert.deepEqual(Array.from(scope.state.setSelectedOutputPhotos),scope.selectedPhotoIndices.map(i=>candidates[i]));
    assert.equal(candidates.length,count*2);
    scope.step='EDIT'; scope.printSelectionConfirmed=true; scope.selectedOutputPhotos=scope.state.setSelectedOutputPhotos;
    handler('handleFinish',scope)(); assert.equal(scope.state.setStep,'RESULT');
    scope.printSelectionConfirmed=false; scope.state.setStep=undefined;
    handler('handleFinish',scope)(); assert.equal(scope.state.setStep,undefined,'cannot bypass confirmation');
  }
});

test('composite uses selected outputs while the download gallery receives every captured candidate', async () => {
  const drawn = [], uploaded = [];
  const ctx = {fillRect(){},save(){},restore(){},beginPath(){},rect(){},clip(){},strokeRect(){}};
  const scope = stateScope({selectedLayoutId:'1x1', capturedPhotos:['rejected','chosen'], selectedOutputPhotos:['chosen'],
    printSelectionConfirmed:true, outputCount:1, selectedPackage:'print', step:'RESULT', selectedPrintPhotoIndex:1,
    assertPrintPhotoGeometryCurrent:()=>{},
    processedFrame:null, selectedFrame:null, selectedFilter:null, photoAdjust:{brightness:100,contrast:100,saturation:100},
    getEffectiveLayoutConfig:()=>({width:708,height:1062,slots:[{x:40,y:60,width:628,height:782}]}),
    getCaptureLayoutConfig:()=>({width:638,height:791,slots:[{x:0,y:71,width:555,height:555}]}),
    getSlotBorderConfig:()=>({color:'white',width:1}), document:{createElement:()=>({getContext:()=>ctx,toDataURL:()=> 'composite'})},
    loadImageElement:async photo=>photo, drawCoverInto:(_ctx,image)=>drawn.push(image), console,
    finalPhotoUploadPromiseRef:{current:null}, sessionCode:'S', KioskApiError:Error,
    fetch:async url=>({blob:async()=>url}), uploadPhoto:async (...args)=>{uploaded.push(args);return 'https://cdn/final';},
    ensureSessionCompleted:async()=>({downloadUrl:'https://cdn/download'})});
  assert.equal(await handler('generateCompositeImage',scope)(),'composite');
  assert.deepEqual(drawn,['chosen']);
  scope.generateCompositeImage=async()=> 'composite'; await handler('doAutoUpload',scope)();
  assert.deepEqual(uploaded.map(args=>args[2]),['S_single_1.png','S_single_2.png','S_frame.png']);
  assert.deepEqual(uploaded.slice(0,2).map(args=>args[0]),['rejected','chosen']);
  const crops=[]; scope.generatePrintImage=async(...args)=>{crops.push(args);return 'crop';};
  assert.equal(await handler('prepareSelectedPrintImage',scope)(),'crop');
  assert.deepEqual(crops,[['chosen',null,'1x1',0,scope.getCaptureLayoutConfig()]]);
});

test('individual retakes are guarded before confirmation, clear selected output, and keep a batch-sized session clock', () => {
  const scope = stateScope({step:'PRINT_SELECTION', printSelectionConfirmed:false, isPrintActive:false,
    printActionInFlightRef:{current:false}, capturedPhotos:['one','two'], captureExpired:false,
    captureDeadline:Date.now()+120000, reviewPhotoIndex:null, retakeReadyTimer:{current:null}, Date, candidateCount:6,
    getCaptureDurationSeconds:count=>(count+2)*60, selectedLayoutId:'3x1', selectedFrame:null});
  handler('handleRetakePhoto',scope)(1);
  assert.equal(scope.state.setRetakeIndex,1);
  assert.equal(scope.state.setStep,'CAPTURE');
  assert.equal(scope.state.setSelectedOutputPhotos?.length,0);
  assert.equal(scope.state.setSelectedPhotoIndices?.length,0);
  assert.equal(scope.state.setPrintSelectionConfirmed,false);
  scope.state.setStep=undefined; scope.printSelectionConfirmed=true;
  handler('handleRetakePhoto',scope)(0); assert.equal(scope.state.setStep,undefined);
  scope.printSelectionConfirmed=false; scope.captureDeadline=Date.now()-1;
  handler('handleRetakePhoto',scope)(0); assert.equal(scope.state.setStep,undefined,'expired clock cannot start stranded retake');
  scope.captureDeadline=null;
  handler('startAutoCapture',scope)();
  assert.equal(scope.state.setRemainingCaptureSeconds,480,'time budget scales with all six candidates, not three outputs');
});

test('candidate selection toggles unique choices up to the requested output count and cannot change finalized output', () => {
  const scope = stateScope({step:'PRINT_SELECTION', capturedPhotos:['a','b','c','d'], outputCount:2,
    printSelectionConfirmed:false, isPrintActive:false, printActionInFlightRef:{current:false}});
  scope.state.setSelectedPhotoIndices=[];
  const select=handler('handlePhotoSelection',scope);
  select(1); select(3);
  assert.deepEqual(Array.from(scope.state.setSelectedPhotoIndices),[1,3]);
  select(0); assert.deepEqual(Array.from(scope.state.setSelectedPhotoIndices),[1,0]);
  select(2); assert.deepEqual(Array.from(scope.state.setSelectedPhotoIndices),[1,2]);
  select(2); assert.deepEqual(Array.from(scope.state.setSelectedPhotoIndices),[1,2]);
  scope.printSelectionConfirmed=true; select(3);
  assert.deepEqual(Array.from(scope.state.setSelectedPhotoIndices),[1,2]);
});

test('workflow UI exposes package-specific layouts, multi-choice review and individual retakes', () => {
  assert.match(source,/\.filter\(layout => isWorkflowLayoutAllowed\(layout.id as GridLayoutId\)\)/);
  assert.match(source,/onClick=\{\(\) => handlePhotoSelection\(index\)\}/);
  assert.match(source,/id=\{`btn-retake-candidate-\$\{index\}`\}/);
  assert.match(source,/selectedPhotoIndices.length !== outputCount/);
  assert.match(source,/Print \+ Digital/);
  assert.doesNotMatch(source,/Foto digital tetap berupa grid lengkap/);
});

test('Print plus Digital includes digital download and Admin-controlled email while capture counts all candidates', () => {
  assert.match(source,/selectedPackage && \(\s*<div id="digital-download-panel"/);
  assert.match(source,/\{tombol.email && \(/);
  assert.doesNotMatch(source,/selectedPackage === 'digital' && tombol.email/);
  assert.match(source,/id="photo-counter"[^\n]*\{capturedPhotos.length\}\/\{candidateCount\}/);
  assert.match(source,/Array.from\(\{length: candidateCount\}\)/);
});

test('batch retake cannot reset an active or successful print, and expired capture exposes recovery', () => {
  for(const flags of [{isPrintActive:true},{printState:'success'},{btPrintState:'done'},{printActionInFlightRef:{current:true}},{uploadStatus:'uploading'}]) {
    const scope=stateScope({isPrintActive:false,printState:'idle',btPrintState:'idle',uploadStatus:'idle',printActionInFlightRef:{current:false},...flags});
    scope.setCapturedPhotos=()=>assert.fail('active or completed print must not be reset by retake');
    handler('handleRetake',scope)();
    assert.equal(scope.state.setCapturedPhotos,undefined,'do not reopen same paid print after dispatch');
  }
  assert.match(source,/id="btn-restart-expired-capture" onClick=\{handleRetake\}/);
});

test('review Retake replaces the current shot before the next candidate is taken', () => {
  const scope=stateScope({step:'CAPTURE',reviewPhotoIndex:0,printSelectionConfirmed:false,isPrintActive:false,
    printActionInFlightRef:{current:false},capturedPhotos:['first'],captureExpired:false,captureDeadline:Date.now()+120000,
    retakeReadyTimer:{current:null},Date});
  const retake=handler('handleRetakePhoto',scope);
  retake(1);assert.equal(scope.state.setRetakeIndex,undefined,'cannot retake a future photo');
  retake(0);assert.equal(scope.state.setRetakeIndex,0);
  assert.equal(scope.state.setReviewPhotoIndex,null);assert.equal(scope.state.setIsAutoCapturing,true);
  assert.equal(scope.state.setStep,'CAPTURE');
  assert.match(source,/id="btn-retake-review-photo"/);assert.match(source,/id="btn-continue-review-photo"/);
  assert.match(source,/renderCandidatePreview\(reviewPhotoIndex, true\)/,'review renders the shared full-slot preview');
});

test('per-shot review uses actual frame slot dimensions, with two candidates per output slot', () => {
  const slots=[{width:800,height:500},{width:500,height:900},{width:700,height:700}];
  const scope={selectedFrame:{id:'custom'},selectedLayoutId:'3x1',getCaptureLayoutConfig:(frame,layout)=>{
    assert.equal(frame.id,'custom');assert.equal(layout,'3x1');return {slots};
  }};
  const getSlot=handler('getReviewPhotoSlot',scope);
  for(let i=0;i<6;i++) assert.deepEqual(getSlot(i),slots[Math.floor(i/2)]);
  assert.match(source,/renderCandidatePreview\(reviewPhotoIndex, true\)/);
  assert.match(source,/getReviewPhotoSlot\(index\)/);
  assert.match(source,/getSelectionPhotoSlot\(index\)/);
});

test('selection previews use the destination output slot, independent of raw candidate index', () => {
  const slots=[{width:800,height:500},{width:500,height:900}];
  const scope={selectedFrame:{id:'custom'},selectedLayoutId:'2x1',selectedPhotoIndices:[],getEffectiveLayoutConfig:()=>({slots})};
  const getSlot=handler('getSelectionPhotoSlot',scope);
  assert.deepEqual(getSlot(3),slots[0],'first choice targets first output slot');
  scope.selectedPhotoIndices=[3];assert.deepEqual(getSlot(3),slots[0]);assert.deepEqual(getSlot(0),slots[1],'next choice previews its future slot');
  scope.selectedPhotoIndices=[3,0];assert.deepEqual(getSlot(0),slots[1]);assert.deepEqual(getSlot(3),slots[0]);
  scope.getEffectiveLayoutConfig=()=>({slots:[slots[0]]});scope.selectedPhotoIndices=[];
  for(const index of [0,1]) assert.deepEqual(getSlot(index),slots[0],'Print candidates both use slot zero');
  assert.match(source,/renderCandidatePreview\(index\)/);
  assert.match(source,/renderCandidatePreview = \(index: number, review = false\) => review/);
  assert.match(source,/photo=\{capturedPhotos\[index\]\}/);
  assert.match(source,/getSelectionPhotoSlot\(index\)/);
  assert.match(source,/getReviewPhotoSlot\(index\)/);
});

test('all Photobooth Back controls share one pill-button component', () => {
  assert.match(source, /const BackButton: React\.FC/);
  assert.match(source, /<BackButton onClick=\{onBack\} uiMode=\{uiMode\} \/>/);
  assert.match(source, /<BackButton id="btn-back-landing" onClick=\{goToSignage\} uiMode=\{uiMode\} \/>/);
  assert.match(source, /<BackButton onClick=\{\(\) => setStep\('LAYOUT'\)\} uiMode=\{uiMode\} \/>/);
  assert.match(source, /<BackButton[\s\S]*?handleResetScan\(\)[\s\S]*?uiMode=\{uiMode\}/);
  assert.doesNotMatch(source, /\/assets\/BACK\.png/,
    'payment Back controls must not keep the differently sized legacy image');
});

test('captured photo thumbnails below the camera fill their cards for both packages', () => {
  const thumbnails = source.match(/\{\/\* Thumbnails \*\/\}([\s\S]*?)\{\/\* Center: Start button \*\/\}/)?.[1] || '';
  assert.match(thumbnails, /<img src=\{capturedPhotos\[i\]\}[^>]*className="w-full h-full object-cover object-center"/,
    'captured photos fill the thumbnail card without a paper-shaped preview');
  assert.doesNotMatch(thumbnails, /NiimbotPhotoPreview/,
    'Print thumbnails must not add white paper margins around the captured photo');
});

test('Niimbot paper geometry and adjustments remain available to physical Print output', async () => {
  const {labelSize,labelFrameBox,labelMmFromPaperSize}=await import('./labelGeometry.ts');
  const scope={kioskPaperSize:'nimbotpaper-polaroid',labelMmFromPaperSize,computeLabelSize:labelSize,labelFrameBox,
    printMarginTopPx:0,printMarginRightPx:0,printMarginLeftPx:0,printMarginBottomPx:0,DEFAULT_ADJUSTMENTS:{},
    photoAdjust:{fitMode:'fit'},thermalDensity:3,thermalOffsetYPx:0,thermalOffsetXPx:0,isGrayscaleAlgorithm:()=>false,DEFAULT_GRAYSCALE_ALGORITHM:'rec601'};
  const resolve=handler('getNiimbotPrintSettings',scope);const settings=resolve();
  assert.equal(settings.size.widthPx,638);assert.equal(settings.size.heightPx,791);
  assert.equal(settings.adjustments.marginTopPx,59);assert.equal(settings.adjustments.marginBottomPx,165);
  assert.equal(settings.adjustments.fitMode,'cover');
  scope.printMarginTopPx=100;scope.printMarginBottomPx=124;scope.photoAdjust.fitMode='stretch';
  assert.equal(resolve().adjustments.marginTopPx,100);assert.equal(resolve().adjustments.fitMode,'stretch');
  assert.match(source,/const \{size, adjustments\} = getNiimbotPrintSettings\(\)/);
  assert.match(source,/renderCameraLivePreview = \(\) =>/);
  assert.match(source,/renderCandidatePreview = \(index: number, review = false\) => review/);
});

test('Print and Digital use the same full-slot preview in per-shot review and selection', () => {
  const results={};
  for (const pkg of ['print','digital']) for(const review of [false,true]) {
    let settingsCalls=0;
    const scope={selectedPackage:pkg,isVertical:false,capturedPhotos:['raw-one','raw-two'],
      React:{createElement:(type,props)=>({type,props})},
      NiimbotPhotoPreview:'Niimbot',ReviewPhotoPreview:'DigitalReview',SelectionPhotoPreview:'DigitalSelection',
      getNiimbotPrintSettings:()=>{settingsCalls++;return {size:{widthPx:638,heightPx:791}};},
      getReviewPhotoSlot:()=>({width:628,height:782}),getSelectionPhotoSlot:()=>({width:628,height:782})};
    const fn=vm.runInNewContext(ts.transpileModule(`(${initializer('renderCandidatePreview').getText(ast)});`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React}}).outputText,scope);
    const result=fn(1,review);results[`${pkg}-${review?'review':'selection'}`]=result;
    assert.equal(settingsCalls,0,'review preview must not use Niimbot paper geometry');
    assert.equal(result.type,review?'DigitalReview':'DigitalSelection');
    assert.equal(result.props.index,1);
  }
  for (const view of ['review','selection']) {
    assert.equal(results[`print-${view}`].type,results[`digital-${view}`].type);
    assert.equal(JSON.stringify(results[`print-${view}`].props),JSON.stringify(results[`digital-${view}`].props));
  }
});

test('Print Customize keeps the color composite and adds a separate monochrome label preview', () => {
  assert.match(source, /<PreviewComponent id=\{selectedPackage === 'print' \? 'print-color-preview' : undefined\} maxHeightStr=\{isVertical \? '34vh' : '75vh'\} \/>/,
    'the existing large color/frame preview stays visible');
  const previewIndex=source.lastIndexOf('<PreviewComponent id={selectedPackage',source.indexOf('id="print-monochrome-preview-panel"'));
  const panelIndex=source.indexOf('id="print-monochrome-preview-panel"');
  const controlsIndex=source.indexOf('{/* Controls – bottom in vertical, right in horizontal */}',panelIndex);
  const flexRowIndex=source.lastIndexOf('flex flex-row',previewIndex);
  assert.ok(previewIndex >= 0 && flexRowIndex >= 0 && previewIndex < panelIndex && panelIndex < controlsIndex,
    'color and monochrome previews are paired together in the main preview area, before controls');
  assert.match(source.slice(flexRowIndex,panelIndex),/PreviewComponent[\s\S]*$/,
    'the color frame and monochrome print sample are laid out side by side');
  const rendererAttrs=source.match(/<NiimbotPhotoPreview(?=[^>]*alt="Monochrome photo renderer")([^>]*)\/>/s)?.[1] || '';
  assert.ok(rendererAttrs, 'a dedicated Niimbot monochrome photo renderer is present');
  assert.match(source, /<PreviewComponent[\s\S]*?id="print-monochrome-preview"[\s\S]*?monochromePhotoUrl=\{monochromePreviewUrl\}/,
    'the monochrome photo is composited into the same Admin frame renderer as the color preview');
  assert.match(rendererAttrs, /source=\{capturedPhotos\[selectedPrintPhotoIndex\]\}/,
    'the mono preview uses the actual selected print candidate');
  assert.match(rendererAttrs, /settings=\{getNiimbotPrintSettings\(\)\}/,
    'the mono preview uses the current printer settings');
  assert.match(rendererAttrs, /slot=\{getSelectedPrintPreviewSlot\(\)\}/,
    'the display crop uses the exact effective output frame slot');
  assert.match(rendererAttrs, /matchPhotoCrop/,
    'the display-only mono photo uses the same slot crop, without changing the physical print path');
  assert.match(rendererAttrs, /renderOnly/,
    'Niimbot output is rendered as the photo layer, not as a separate paper-shaped panel');
  assert.doesNotMatch(rendererAttrs, /\bcolor(?:\s|=|$)/,
    'the dedicated output preview must use the default monochrome path');
  const noticeIndex=source.indexOf('id="print-monochrome-print-notice"');
  assert.ok(noticeIndex >= 0 && noticeIndex < previewIndex,
    'the print-result notice is rendered above the preview frames, outside their clipped panels');
  assert.match(source, /Pratinjau hitam-putih ini menunjukkan foto akan dicetak dalam hitam-putih; tekstur hasil di kertas dapat berbeda/,
    'the visible notice explains that the grayscale preview represents the print result and paper texture may differ');
});
test('changing frame reruns the monochrome renderer even when slot geometry stays the same', () => {
  const rendererAttrs=source.match(/<NiimbotPhotoPreview(?=[^>]*alt="Monochrome photo renderer")([^>]*)\/>/s)?.[1] || '';
  assert.match(rendererAttrs, /frameRevision=\{selectedFrame\?\.id/,
    'frame identity must rerun the monochrome render even when a different frame has identical slot geometry');
});

test('Digital camera stays direct; Print display shares only the full processing source', () => {
  const scope={selectedPackage:'digital',processingCanvasRef:{},printPresentationConfig:{slots:[{width:555,height:555}]},
    PrintCameraPreview:'PrintCameraPreview',React:{Fragment:'fragment',createElement:(type,props,...children)=>({type,props,children})}};
  const fn=vm.runInNewContext(ts.transpileModule(`(${initializer('renderCameraLivePreview').getText(ast)});`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React}}).outputText,scope);
  const digital=fn();assert.equal(digital.type,'canvas');assert.equal(digital.props.id,'camera-preview');
  scope.selectedPackage='print';const print=fn();
  assert.equal(print.children[0].type,'canvas');assert.equal(print.children[0].props.ref,digital.props.ref);
  assert.equal(print.children[0].props.className,'hidden');
  assert.equal(print.children[1].type,'PrintCameraPreview');
  assert.equal(print.children[1].props.sourceRef,digital.props.ref);
  assert.deepEqual(print.children[1].props.slot,{width:555,height:555});
});

test('replacing a selected photo is one tap for Print and replaces the last output for full Digital selections', () => {
  const scope=stateScope({step:'PRINT_SELECTION',printSelectionConfirmed:false,isPrintActive:false,
    printActionInFlightRef:{current:false},selectedPackage:'print',outputCount:1,capturedPhotos:['a','b'],selectedPhotoIndices:[0]});
  scope.state.setSelectedPhotoIndices=[0];
  const select=handler('handlePhotoSelection',scope);select(1);
  assert.deepEqual(Array.from(scope.state.setSelectedPhotoIndices),[1]);
  const digital=stateScope({step:'PRINT_SELECTION',printSelectionConfirmed:false,isPrintActive:false,
    printActionInFlightRef:{current:false},selectedPackage:'digital',outputCount:3,capturedPhotos:['a','b','c','d','e','f']});
  digital.state.setSelectedPhotoIndices=[0,2,4];handler('handlePhotoSelection',digital)(5);
  assert.deepEqual(Array.from(digital.state.setSelectedPhotoIndices),[0,2,5]);
});

test('expired review cannot start another capture but can confirm the last shot or restart visibly', () => {
  const scope=stateScope({step:'CAPTURE',reviewPhotoIndex:0,capturedPhotos:['one'],candidateCount:2,captureExpired:true,captureDeadline:Date.now()-1,Date});
  const accept=handler('handleContinueAfterReview',scope);
  accept();assert.equal(scope.state.setIsAutoCapturing,undefined);assert.equal(scope.state.setReviewPhotoIndex,undefined);
  assert.match(source,/id="btn-restart-expired-review" onClick=\{handleRetake\}/);
  scope.capturedPhotos=['one','two'];scope.reviewPhotoIndex=1;
  accept();assert.equal(scope.state.setStep,'PRINT_SELECTION');assert.equal(scope.state.setReviewPhotoIndex,null);
});

test('each of 2/4/6 captures pauses for review and only Continue advances to the next photo or final selection', () => {
  for (const count of [1, 2, 3]) {
    const scope = stateScope({step:'CAPTURE',reviewPhotoIndex:null,captureExpired:false,capturedPhotos:[],candidateCount:count * 2,captureDeadline:null,retakeIndex:null,
      processingCanvasRef:{current:{width:640,height:480}},shutterAudioRef:{current:null},Date,
      selectedPackage:'digital',printPresentationKey:'digital-fixture',
      selectedLayoutId:'1x1',selectedFrame:null,getEffectiveLayoutConfig:()=>({slots:[{}]}),
      useCallback:fn=>fn,setTimeout:fn=>fn(),document:{createElement:()=>({getContext:()=>({translate(){},scale(){},drawImage(){}}),toDataURL:()=> 'shot'})}});
    scope.state.setCapturedPhotos=[];scope.state.setStep='CAPTURE';
    const capture=handler('takePhoto',scope),accept=handler('handleContinueAfterReview',scope);
    for(let i=0;i<count*2;i++) {
      scope.capturedPhotos=scope.state.setCapturedPhotos;scope.reviewPhotoIndex=null;
      capture();
      assert.equal(scope.state.setReviewPhotoIndex,i,'review the newly taken candidate immediately');
      assert.equal(scope.state.setIsAutoCapturing,false,'no countdown/capture while waiting for confirmation');
      assert.equal(scope.state.setStep,'CAPTURE','even the last shot needs confirmation');
      scope.capturedPhotos=scope.state.setCapturedPhotos;scope.reviewPhotoIndex=scope.state.setReviewPhotoIndex;
      capture();assert.equal(scope.state.setCapturedPhotos.length,i+1,'duplicate capture cannot bypass review');
      accept();assert.equal(scope.state.setReviewPhotoIndex,null);
      if(i<count*2-1) {
        assert.equal(scope.state.setStep,'CAPTURE');assert.equal(scope.state.setIsAutoCapturing,true,'explicit Continue starts next shot');
      }else assert.equal(scope.state.setStep,'PRINT_SELECTION','final confirmation goes to selection, never bypasses it to Edit');
    }
    scope.step='CAPTURE';scope.retakeIndex=1;scope.reviewPhotoIndex=null;scope.state.setStep='CAPTURE';scope.capturedPhotos=scope.state.setCapturedPhotos;
    capture();assert.equal(scope.state.setCapturedPhotos.length,count*2,'retake replaces, never appends');
    assert.equal(scope.state.setReviewPhotoIndex,1,'replacement also requires review');
    scope.reviewPhotoIndex=1;accept();assert.equal(scope.state.setStep,'PRINT_SELECTION');
  }
});

test('frame decorations stay behind photo slots so changing a frame cannot cover the selected photo', () => {
  const slots = source.slice(source.indexOf('{config.slots.map((slot, i) => {'), source.indexOf('{frameToRender?.elements?.map(el => {'));
  const decorations = source.slice(source.indexOf('{frameToRender?.elements?.map(el => {'), source.indexOf('                </div>\n            </div>\n        </div>', source.indexOf('{frameToRender?.elements?.map(el => {')));
  assert.match(slots, /zIndex:\s*1/);
  assert.match(decorations, /zIndex:\s*0/);
  const composite = source.slice(source.indexOf('const generateCompositeImage = async'));
  const frameLayerIndex = composite.indexOf('// Frame decorations render below photo slots');
  assert.ok(frameLayerIndex >= 0 && frameLayerIndex < composite.indexOf('// 3 — Photos'), 'exported frame elements must render before photos');
});


test('legacy session provider values cannot divert required payments away from visual proof', async () => {
  for (const payment_required of [true, undefined, false]) {
    const scope = stateScope({selectedPackage:'digital',frames:[{id:'1x1',styles:[{id:1}]}],
      isWorkflowLayoutAllowed:()=>true,getEffectiveLayoutConfig:()=>({slots:[{}]}),
      printPhotoLayoutRef:{current:null},getAppConfig:()=>({kioskId:'K-001'}),KioskApiError:Error,
      startSession:async()=>({id:'legacy-session',payment_method:'duitku_qris',payment_required,package_type:'digital'})});
    await handler('handleLayoutSelect',scope)('1x1');
    assert.equal(scope.state.setPaymentMethod,'qris_visual_proof');
    assert.equal(scope.state.setPaymentPollingState,'idle');
    assert.equal(scope.state.setStep,payment_required === false ? 'CAPTURE' : 'PAYMENT');
    if (payment_required !== false) assert.notEqual(scope.state.setVerificationStatus,'verified');
  }
});
