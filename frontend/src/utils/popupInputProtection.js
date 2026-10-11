// Protect dismissals, never submit/save handlers. Field snapshots stay in memory.
const ROOTS = 'dialog[open], [role="dialog"], [data-popup-root], .fixed.inset-0, [class*="modal"], [class*="backdrop"]';
const FIELDS = 'input,select,textarea,[contenteditable="true"]';
const normalize = value => String(value || '').trim().toLocaleLowerCase();

export function popupControlValue(field) {
  if (['checkbox','radio'].includes(field.type)) return String(field.checked);
  if (field.type === 'file') return JSON.stringify([...field.files].map(file => [file.name,file.size,file.lastModified]));
  if (field.multiple && field.selectedOptions) return JSON.stringify([...field.selectedOptions].map(option => option.value));
  return String(field.value ?? field.textContent ?? '');
}
export function isDismissAction(button, labels = {close:['Close'],cancel:['Cancel']}) {
  if (button.getAttribute('data-popup-action') === 'submit') return false;
  if (button.getAttribute('data-popup-dismiss') !== null) return true;
  const labelled = button.getAttribute('aria-label') || button.getAttribute('title');
  const name = normalize(labelled || button.textContent);
  const closes = labels.close.map(normalize), cancels = labels.cancel.map(normalize);
  if (closes.some(label => name === label || (labelled && name.startsWith(`${label} `))) || cancels.includes(name) || ['×','✕','✖'].includes(name)) return true;
  return !name && Boolean(button.querySelector('svg.lucide-x,svg.lucide-circle-x'));
}

export function installPopupInputProtection(doc, browser, {getLabels = () => ({close:['Close'],cancel:['Cancel']})} = {}) {
  const states = new WeakMap();
  const style = element => browser.getComputedStyle(element);
  const visible = element => element.isConnected && element.getClientRects().length && style(element).visibility !== 'hidden';
  const fullOverlay = element => {
    if (style(element).position !== 'fixed') return false;
    const box = element.getBoundingClientRect();
    return box.width >= browser.innerWidth - 2 && box.height >= browser.innerHeight - 2;
  };
  const isRoot = element => {
    if (!visible(element)) return false;
    if (element.tagName === 'DIALOG' || element.getAttribute('role') === 'dialog' || element.hasAttribute('data-popup-root')) return true;
    return fullOverlay(element) && !element.querySelector('dialog[open],[role="dialog"],[data-popup-root]');
  };
  const roots = () => [...doc.querySelectorAll(ROOTS)].filter(isRoot);
  const fields = root => [...root.querySelectorAll(FIELDS)].filter(field => {
    if (field.disabled || field.readOnly || ['hidden','button','submit','reset','search'].includes(field.type)) return false;
    return ![...root.querySelectorAll(ROOTS)].some(nested => nested !== root && isRoot(nested) && nested.contains(field));
  });
  const snapshot = root => new Map(fields(root).map(field => [field,popupControlValue(field)]));
  const ensure = root => {
    let state = states.get(root);
    if (!state) { state = {baseline:snapshot(root),touched:false,form:false,allowClick:null,allowCancel:false,savedVersion:root.getAttribute('data-popup-saved-version')}; states.set(root,state); }
    return state;
  };
  const scan = () => { for (const root of roots()) {
    const state=ensure(root),savedVersion=root.getAttribute('data-popup-saved-version');
    // Components increment this only after a confirmed save, never on submit.
    if (savedVersion!==state.savedVersion) { state.savedVersion=savedVersion; state.touched=false; }
    if (!state.touched) state.baseline=snapshot(root);
  } };
  const level = root => {
    if (root.tagName === 'DIALOG' && root.matches(':modal')) return 1e9;
    let highest=0;
    for (let node=root;node && node!==doc.documentElement;node=node.parentElement) highest=Math.max(highest,Number.parseInt(style(node).zIndex,10) || 0);
    return highest;
  };
  const top = () => roots().map((root,index)=>({root,index,z:level(root)})).sort((a,b)=>a.z-b.z || a.index-b.index).at(-1)?.root;
  const policy = root => root.getAttribute('data-popup-protection');
  const form = root => {
    if (['readonly','handled'].includes(policy(root))) return false;
    const state=ensure(root);
    state.form ||= policy(root)==='form' || fields(root).length>0;
    return state.form;
  };
  const dirty = root => {
    if (root.getAttribute('data-popup-dirty')==='true') return true;
    const state=ensure(root),current=snapshot(root);
    return state.touched && (current.size!==state.baseline.size || [...current].some(([field,value])=>state.baseline.get(field)!==value));
  };
  const block = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const confirmClose = root => !dirty(root) || browser.confirm('You have unsaved changes. Close this form? Choose Cancel to keep editing.');
  const outside = (root,event) => {
    if (root.tagName==='DIALOG' && event.target===root) {
      const box=root.getBoundingClientRect();
      return event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom;
    }
    return !root.contains(event.target) || (event.target===root && fullOverlay(root));
  };
  const edit = event => {
    const root=top();
    if (!root || !root.contains(event.target) || !form(root)) return;
    const state=ensure(root);
    if (event.type==='focusin' || event.type==='beforeinput') { if (!state.touched) state.baseline=snapshot(root); }
    else state.touched=true;
  };
  const pointer = event => {
    const root=top();
    if (root && form(root) && outside(root,event)) block(event);
  };
  const click = event => {
    const root=top();
    if (!root || !form(root)) return;
    if (outside(root,event)) { block(event); return; }
    const state=ensure(root),button=event.target.closest?.('button,[role="button"],[data-popup-dismiss]');
    if (button && isDismissAction(button,getLabels())) {
      if (state.allowClick===button) { state.allowClick=null; return; }
      if (!confirmClose(root)) block(event);
    } else if (event.target.closest?.(FIELDS) || (button && !(button.form && button.type==='submit'))) state.touched=true;
  };
  const escape = event => {
    if (event.key!=='Escape') return;
    const root=top();
    if (!root || !form(root)) return;
    const buttons=[...root.querySelectorAll('button,[role="button"],[data-popup-dismiss]')].filter(button=>!button.disabled && isDismissAction(button,getLabels()));
    const closeButton=buttons.find(button=>button.getAttribute('aria-label') || button.querySelector('svg.lucide-x')) || buttons[0];
    if (closeButton) {
      block(event);
      if (confirmClose(root)) { ensure(root).allowClick=closeButton; closeButton.click(); }
    } else if (!confirmClose(root)) block(event);
    else {
      const state=ensure(root);state.allowCancel=true;
      browser.setTimeout(()=>{state.allowCancel=false;},0);
    }
  };
  const cancel = event => {
    const root=event.target;
    if (!root.matches?.('dialog') || !form(root)) return;
    const state=ensure(root);
    if (state.allowCancel) { state.allowCancel=false; return; }
    if (!confirmClose(root)) block(event);
  };
  const listeners={focusin:edit,beforeinput:edit,input:edit,change:edit,pointerdown:pointer,mousedown:pointer,touchstart:pointer,click,keydown:escape,cancel};
  for (const [name,handler] of Object.entries(listeners)) doc.addEventListener(name,handler,{capture:true,passive:false});
  const observer=new browser.MutationObserver(scan);
  observer.observe(doc.documentElement,{subtree:true,childList:true,attributes:true});
  scan();
  return () => { observer.disconnect(); for (const [name,handler] of Object.entries(listeners)) doc.removeEventListener(name,handler,true); };
}
