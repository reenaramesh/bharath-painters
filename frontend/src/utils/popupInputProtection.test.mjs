import test from 'node:test';
import assert from 'node:assert/strict';
import { isDismissAction, popupControlValue } from './popupInputProtection.js';

const button = (text, attributes = {}, icon = false) => ({ textContent:text, type:'button', getAttribute:name=>attributes[name] ?? null, querySelector:()=>icon ? {} : null });
test('dismissal recognizes close/cancel/icons and translated labels, preserving business actions',()=>{
  assert.equal(isDismissAction(button('Cancel')),true);
  assert.equal(isDismissAction(button('',{'aria-label':'Close property form'},true)),true);
  assert.equal(isDismissAction(button('',{},true)),true);
  assert.equal(isDismissAction(button('Save Draft')),false);
  assert.equal(isDismissAction(button('Cancel work order')),false);
  assert.equal(isDismissAction(button('Close ticket')),false);
  assert.equal(isDismissAction(button('',{'aria-label':'Remove image'},true)),false);
  assert.equal(isDismissAction(button('Cancel',{'data-popup-action':'submit'})),false);
  assert.equal(isDismissAction(button('ರದ್ದು'),{cancel:['ರದ್ದು'],close:['ಮುಚ್ಚಿ']}),true);
});
test('comparison uses checked state and file metadata without reading file contents',()=>{
  assert.equal(popupControlValue({type:'checkbox',checked:false,value:'on'}),'false');
  assert.equal(popupControlValue({type:'checkbox',checked:true,value:'on'}),'true');
  assert.notEqual(popupControlValue({type:'file',files:[]}),popupControlValue({type:'file',files:[{name:'site.png',size:12,lastModified:7}]}));
  assert.equal(popupControlValue({type:'number',value:'12.5'}),'12.5');
});
