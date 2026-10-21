import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../components/PhotoBooth.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('PhotoBooth.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function initializer(name) {
  let result;
  function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)result=n.initializer;ts.forEachChild(n,visit);}
  visit(ast);assert.ok(result,`${name} exists`);return result.getText(ast);
}
function run(name,scope){return vm.runInNewContext(ts.transpileModule(`(${initializer(name)});`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,scope);}
const admin={width:708,height:1062,slots:[{x:40,y:60,width:628,height:782}]};
const capture={width:638,height:791,slots:[{x:0,y:71,width:555,height:555}]};
test('Print full composite uses original Admin canvas and slot, not locked Niimbot capture box',async()=>{
  const calls=[];
  const ctx={fillRect(){},save(){},restore(){},beginPath(){},rect(){},clip(){},strokeRect(){}};
  const canvas={getContext:()=>ctx,toDataURL:()=>`${canvas.width}x${canvas.height}`};
  const scope={selectedPackage:'print',selectedLayoutId:'1x1',printSelectionConfirmed:true,selectedOutputPhotos:['square'],outputCount:1,
    selectedFrame:null,processedFrame:null,selectedFilter:null,photoAdjust:{brightness:100,contrast:100,saturation:100},
    getEffectiveLayoutConfig:()=>admin,getPresentationLayoutConfig:()=>capture,getCaptureLayoutConfig:()=>capture,
    loadImageElement:async()=>({naturalWidth:555,naturalHeight:555}),drawCoverInto:(...args)=>calls.push(args.slice(2)),
    getSlotBorderConfig:()=>({width:1,color:'white'}),document:{createElement:()=>canvas},console};
  assert.equal(await run('generateCompositeImage',scope)(),'708x1062');
  assert.deepEqual(calls,[[40,60,628,782]]);
});
test('frame-based color and mono UI use original Admin geometry while review stays capture-only',()=>{
  const scope={selectedPackage:'print',selectedFrame:null,processedFrame:null,selectedLayoutId:'1x1',selectedPhotoIndices:[],
    getEffectiveLayoutConfig:()=>admin,getPresentationLayoutConfig:()=>capture,getCaptureLayoutConfig:()=>capture};
  assert.equal(run('getSelectedPrintPreviewSlot',scope)(),admin.slots[0]);
  assert.equal(run('getSelectionPhotoSlot',scope)(0),admin.slots[0]);
  assert.equal(run('getReviewPhotoSlot',scope)(0),capture.slots[0]);
  for(const name of ['PreviewComponent','FrameThumbnail']){
    const text=initializer(name);
    assert.match(text,/getEffectiveLayoutConfig/);
    assert.doesNotMatch(text,/getPresentationLayoutConfig|getCaptureLayoutConfig|presentationConfig/);
  }
  assert.doesNotMatch(source,/presentationConfig=\{/,'Admin thumbnails cannot receive a Niimbot override');
  assert.match(initializer('PreviewComponent'),/border: `\$\{Math\.max\(1, slotBorder\.width \* scaleFactor\)\}/,'original slot border stays unchanged for both packages');
});
