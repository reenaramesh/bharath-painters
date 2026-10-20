// Remove explanatory UI copy by source range, preserving surrounding code and data.
import fs from 'node:fs/promises';
import path from 'node:path';
import {parse} from '../frontend/node_modules/@babel/parser/lib/index.js';

const root=path.resolve('frontend/src');
const apply=process.argv.includes('--apply');
const explanatory=/^(?:Use|Choose|Select|Enter|Tap|Click|Drag|Adjust|Manage|Review|Track|Connect|Search|Upload|Create|Save|Add|Set|Keep|Ensure|This |These |You can |Your .* (?:saved|visible)|Only |All .* (?:are|will)|Line \+ Overall)/i;
const sentence=text=>! /^(?:No |Nothing |You have not|You haven't|Loading|Error|Failed|Unable)/i.test(text.trim()) && text.trim().split(/\s+/).length>=6 && (explanatory.test(text.trim()) || /[.!]$/.test(text.trim()));
const staticText=node=>!node ? null : node.type==='StringLiteral' ? node.value : node.type==='JSXExpressionContainer' ? staticText(node.expression) : node.type==='ConditionalExpression' && staticText(node.consequent)!==null && staticText(node.alternate)!==null ? `${staticText(node.consequent)} ${staticText(node.alternate)}` : node.type==='TemplateLiteral' && !node.expressions.length ? node.quasis.map(part=>part.value.cooked).join('') : null;
const allStatic=node=>staticText(node)!==null || node?.type==='JSXExpressionContainer' && node.expression.type==='ConditionalExpression' && allStatic(node.expression.consequent) && allStatic(node.expression.alternate);
const elementName=node=>node?.type==='JSXIdentifier'?node.name:null;
const results=[];
async function scan(directory){
  for(const entry of await fs.readdir(directory,{withFileTypes:true})) {
    const filename=path.join(directory,entry.name);
    if(entry.isDirectory()){await scan(filename);continue;}
    if(!entry.name.endsWith('.jsx') || /(?:RegistrationConsent|Legal|Privacy|Terms)/i.test(entry.name))continue;
    const source=await fs.readFile(filename,'utf8');
    const ast=parse(source,{sourceType:'module',plugins:['jsx']});
    const edits=[];
    function visit(node,parent){
      if(!node||typeof node!=='object')return;
      if(node.type==='JSXOpeningElement') {
        const component=elementName(node.name);
        for(const attr of node.attributes) {
          if(attr.type!=='JSXAttribute')continue;
          const key=attr.name.name;
          if(key==='helpText'||key==='helperText'||(key==='description'&&['PageHeader','AppPageHeader','SectionCard','EmptyState'].includes(component)&&allStatic(attr.value))||(key==='hint'&&component==='StatCard'&&staticText(attr.value)!==null&&!/[\d%₹]/.test(staticText(attr.value))))edits.push({start:attr.start,end:attr.end,reason:`${component}.${key}`});
        }
      }
      if(node.type==='JSXElement'&&['p','small','span'].includes(elementName(node.openingElement.name))) {
        const attrs=node.openingElement.attributes;
        const role=staticText(attrs.find(attr=>attr.name?.name==='role')?.value);
        const css=staticText(attrs.find(attr=>attr.name?.name==='className')?.value)||'';
        const text=node.children.every(child=>child.type==='JSXText'||staticText(child)!==null)?node.children.map(child=>child.type==='JSXText'?child.value:staticText(child)).join(' ').replace(/\s+/g,' ').trim():'';
        if(!['alert','status'].includes(role)&&!/error|alert|empty|consent|text-(?:red|amber|emerald)-/i.test(css)&&(/(?:^|\s)[\w-]*(?:helper|help-text|field-help|save-master-help|surface-help)[\w-]*(?:\s|$)/.test(css)||(text&&sentence(text)&&/text-(?:slate-|gray-)|description|hint|muted/.test(css)))) {
          const child=['JSXElement','JSXFragment'].includes(parent?.type);
          edits.push({start:node.start,end:node.end,replacement:child?'':'null',reason:'inline help'});
          return;
        }
      }
      for(const [key,value] of Object.entries(node))if(!['loc','start','end'].includes(key)){
        if(Array.isArray(value))value.forEach(child=>visit(child,node));else if(value&&typeof value==='object')visit(value,node);
      }
    }
    visit(ast,null);
    const unique=edits.filter(edit=>!edits.some(other=>other!==edit&&other.start<=edit.start&&other.end>=edit.end)).sort((a,b)=>b.start-a.start);
    if(!unique.length)continue;
    let changed=source;
    for(const edit of unique)changed=changed.slice(0,edit.start)+(edit.replacement||'')+changed.slice(edit.end);
    try { parse(changed,{sourceType:'module',plugins:['jsx']}); } catch(error) { throw new Error(`${filename}: ${error.message}`); }
    if(apply)await fs.writeFile(filename,changed,'utf8');
    results.push({file:path.relative(root,filename),removed:unique.length,copy:unique.map(edit=>source.slice(edit.start,edit.end).replace(/\s+/g,' ').slice(0,240))});
  }
}
for(const directory of ['pages','components','layouts'])await scan(path.join(root,directory));
const report={apply,files:results.length,removed:results.reduce((sum,item)=>sum+item.removed,0),changes:results};
await fs.mkdir('output/ui',{recursive:true});
await fs.writeFile('output/ui/help-copy-audit.json',JSON.stringify(report,null,2),'utf8');
console.log(JSON.stringify({apply,files:report.files,removed:report.removed}));
