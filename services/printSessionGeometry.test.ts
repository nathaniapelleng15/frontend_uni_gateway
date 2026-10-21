import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as geometry from './printPhotoGeometry.ts';
const original={width:638,height:791,slots:[{x:0,y:71,width:555,height:555}]};
test('Print geometry cannot silently recrop captured photos when printer configuration changes',()=>{
 assert.equal(typeof geometry.assertPrintPhotoGeometryMatches,'function');
 geometry.assertPrintPhotoGeometryMatches(original,structuredClone(original));
 for(const changed of [{...original,height:792},{...original,slots:[{x:0,y:72,width:555,height:554}]}]){
  assert.throws(()=>geometry.assertPrintPhotoGeometryMatches(original,changed),/ukuran Niimbot berubah/);
 }
});
