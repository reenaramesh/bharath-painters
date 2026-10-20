import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parse} from '@babel/parser';
import {NAVIGATION} from '../src/config/navigation.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const apply=process.argv.includes('--apply');
const verify=process.argv.includes('--verify');
function walk(node,visit,parents=[]) {
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){for(const child of node)walk(child,visit,parents);return;}
  if(node.type)visit(node,parents);
  for(const [key,value] of Object.entries(node))if(!['loc','comments','tokens','extra','errors'].includes(key)&&value&&typeof value==='object')walk(value,visit,[...parents,node]);
}
const ast=source=>parse(source,{sourceType:'module',plugins:['jsx']});
const tag=node=>node?.openingElement?.name?.name;
function behaviorDigest(tree){
  return createHash('sha256').update(JSON.stringify(tree,(key,value)=>{
    if(['start','end','loc','extra','comments','leadingComments','trailingComments','innerComments','tokens'].includes(key))return undefined;
    if(key==='attributes'&&Array.isArray(value))return value.filter(attribute=>attribute.name?.name!=='className');
    return value;
  })).digest('hex');
}
function classPatch(node,name,source){
  const opening=node.openingElement;
  const attribute=opening.attributes.find(value=>value.name?.name==='className');
  if(attribute){
    if(source.slice(attribute.start,attribute.end).includes(name))return null;
    if(attribute.value.type==='StringLiteral')return {start:attribute.value.end-1,end:attribute.value.end-1,value:` ${name}`};
    if(attribute.value.type==='JSXExpressionContainer')return {start:attribute.value.expression.start,end:attribute.value.expression.end,value:`(${source.slice(attribute.value.expression.start,attribute.value.expression.end)}) + " ${name}"`};
    return null;
  }
  return {start:opening.name.end,end:opening.name.end,value:` className="${name}"`};
}
const appSource=await fs.readFile(path.join(root,'src/App.jsx'),'utf8');
const appAst=ast(appSource),pageNames=new Map(),routes=[];
walk(appAst,node=>{
  if(node.type==='VariableDeclarator'&&node.init?.type==='CallExpression'&&node.init.callee.name==='page')pageNames.set(node.id.name,node.init.arguments[0]?.value);
});
walk(appAst,node=>{
  if(node.type!=='JSXElement'||tag(node)!=='Route')return;
  const route=node.openingElement.attributes.find(value=>value.name?.name==='path')?.value?.value;
  const element=node.openingElement.attributes.find(value=>value.name?.name==='element')?.value;
  if(!route||!element)return;
  walk(element,child=>{if(child.type==='JSXElement'&&pageNames.has(tag(child)))routes.push({route,page:pageNames.get(tag(child))});});
});
const entries=[];
const sources=[];
for(const kind of ['pages','components'])for(const name of (await fs.readdir(path.join(root,'src',kind))).filter(value=>value.endsWith('.jsx')).sort())sources.push({kind,name});
const baselinePath=path.join(root,'../docs/application-ui/inventory.json');
let baseline;
try{baseline=JSON.parse(await fs.readFile(baselinePath,'utf8'));}catch{/* first inventory */}
for(const {kind,name} of sources){
  const filename=path.join(root,'src',kind,name),source=await fs.readFile(filename,'utf8'),tree=ast(source);
  const counts={headings:0,fields:0,buttons:0,tables:0},changes=new Map();
  const lucideNames=new Set(tree.program.body.filter(node=>node.type==='ImportDeclaration'&&node.source.value==='lucide-react').flatMap(node=>node.specifiers.map(specifier=>specifier.local.name)));
  const add=(node,marker)=>{
    const key=`${node.start}:${marker}`;
    if(!changes.has(key))changes.set(key,{node,marker});
  };
  walk(tree,(node,parents)=>{
    if(node.type!=='JSXElement')return;
    const name=tag(node);
    if(['h1','h2','h3'].includes(name))counts.headings++;
    if(['input','select','textarea'].includes(name))counts.fields++;
    if(name==='button')counts.buttons++;
    if(name==='button') {
      const children=node.children.filter(child=>child.type!=='JSXText'||child.value.trim());
      add(node,children.length===1&&children[0].type==='JSXElement'&&lucideNames.has(tag(children[0]))?'bp-ui-icon-action':'bp-ui-action');
    }
    if(['a','Link','NavLink'].includes(name)) {
      const children=node.children.filter(child=>child.type!=='JSXText'||child.value.trim());
      if(children.length===1&&children[0].type==='JSXElement'&&lucideNames.has(tag(children[0])))add(node,'bp-ui-icon-action');
    }
    if(name==='table')counts.tables++;
    if(name==='h1'){
      const header=[...parents].reverse().find(parent=>parent.type==='JSXElement'&&tag(parent)==='header');
      if(header)add(header,'bp-ui-page-header');
      add(node,'bp-ui-page-title');
    }
    if(name==='h2')add(node,'bp-ui-section-heading');
    if(['input','select','textarea'].includes(name)){
      const type=node.openingElement.attributes.find(value=>value.name?.name==='type')?.value;
      if(!type||type.type==='StringLiteral'&&!['hidden','checkbox','radio','range','color','file'].includes(type.value))add(node,'bp-ui-control');
    }
    if(name==='table'&&!/^(Quotation|Measurement|CustomerQuotation)/.test(path.basename(filename))){
      const keep=node.openingElement.attributes.some(value=>value.name?.name==='data-mobile-table');
      if(!keep)add(node,'bp-ui-table');
    }
  });
  let next=source;
  const patches=[...changes.values()].map(({node,marker})=>classPatch(node,marker,source)).filter(Boolean).sort((a,b)=>b.start-a.start);
  for(const patch of patches)next=next.slice(0,patch.start)+patch.value+next.slice(patch.end);
  const before=behaviorDigest(tree),after=behaviorDigest(ast(next));
  if(before!==after)throw new Error(`Presentation edit changed behavior in ${name}`);
  if(apply&&next!==source)await fs.writeFile(filename,next);
  const pageRoutes=routes.filter(route=>route.page===name.replace('.jsx','')).map(value=>value.route);
  const roles=[...new Set(NAVIGATION.filter(entry=>pageRoutes.some(route=>route===entry.route.split('?')[0]||route.startsWith(entry.route.split('?')[0]+'/'))).flatMap(entry=>entry.roles))];
  entries.push({file:`src/${kind}/${name}`,page:name,routes:kind==='pages'?pageRoutes:[],roles,controls:counts,sharedUiClasses:(next.match(/bp-ui-(?:page-header|page-title|section-heading|control|table|icon-action|action)/g)||[]).length,behaviorDigest:before,behaviorPreserved:true});
}
const result={date:'2026-10-13',mode:apply?'applied':'inventory',pages:sources.filter(value=>value.kind==='pages').length,components:sources.filter(value=>value.kind==='components').length,routes:routes.length,entries};
if(verify){
  const differences=[];
  for(const entry of entries){
    const original=baseline.entries.find(value=>(value.file||`src/pages/${value.page}`)===entry.file);
    if(!original||original.behaviorDigest!==entry.behaviorDigest||JSON.stringify(original.controls)!==JSON.stringify(entry.controls))differences.push({file:entry.file,originalDigest:original?.behaviorDigest,currentDigest:entry.behaviorDigest,controlsUnchanged:JSON.stringify(original?.controls)===JSON.stringify(entry.controls)});
  }
  await fs.writeFile(path.join(root,'../docs/application-ui/verification.json'),JSON.stringify({checked:entries.length,preserved:entries.length-differences.length,differences},null,2)+'\n');
  if(differences.length){console.error(`Presentation-only comparison flagged ${differences.length} file(s): ${differences.map(value=>value.file).join(', ')}. Details: docs/application-ui/verification.json`);process.exit(1);}
  console.log(`Verified ${entries.length} page/component files: handlers, fields, calculations, routing expressions and permissions retain their recorded syntax trees; only presentation classes differ.`);
  process.exit(0);
}
await fs.mkdir(path.join(root,'../docs/application-ui'),{recursive:true});
const inventoryEntries=entries.map(entry=>baseline?.entries.find(value=>(value.file||`src/pages/${value.page}`)===entry.file)||entry);
if(!apply)await fs.writeFile(baselinePath,JSON.stringify({...result,entries:inventoryEntries},null,2)+'\n');
else await fs.writeFile(path.join(root,'../docs/application-ui/coverage.json'),JSON.stringify(result,null,2)+'\n');
console.log(`${result.pages} pages / ${result.components} components / ${result.routes} direct route bindings; ${apply?'presentation classes applied':'inventory saved'}; behavior digests preserved.`);
