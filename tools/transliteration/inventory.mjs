import { createRequire } from 'node:module';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import systemCopyPlugin from './ui-plugin.mjs';
const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { transformSync } = require('@babel/core');
const traverse = require('@babel/traverse').default;
const root = fileURLToPath(new URL('../../', import.meta.url));
const glossary = JSON.parse(readFileSync(root + 'shared/transliteration/glossary.json'));
const files = [], fallbacks = new Map();
function scan(folder) {
  for (const entry of readdirSync(folder, {withFileTypes:true})) {
    if (entry.isDirectory() && !['preview','i18n','__tests__'].includes(entry.name)) scan(folder+'/'+entry.name);
    else if (entry.isFile() && entry.name.endsWith('.jsx')) {
      const file = folder+'/'+entry.name;
      const { ast } = transformSync(readFileSync(file, 'utf8'), {ast:true,code:false,babelrc:false,configFile:false,parserOpts:{plugins:['jsx']},plugins:[systemCopyPlugin]});
      const sources = [];
      let marked = 0;
      traverse(ast, {JSXOpeningElement(path) {
        const node = path.node;
        if (!['__ScriptText', '__ScriptElement', '__ScriptKnownText', '__ScriptStandardText'].includes(node.name.name)) return;
        marked++;
        for (const attr of node.attributes) {
          if (!attr.value?.expression) continue;
          const expr = attr.value.expression;
          if (attr.name.name === 'source' && expr.type === 'StringLiteral') sources.push(expr.value);
          if (attr.name.name === 'parts' && expr.type === 'ArrayExpression') sources.push(...expr.elements.map((part) => part.value));
          if (attr.name.name === 'scriptFields') traverse(expr, {noScope:true,ObjectProperty(path) {
            if (path.node.key.name === 'systemSource' && path.node.value.type === 'StringLiteral') sources.push(path.node.value.value);
          }});
        }
      }});
      files.push({file:file.replace(root,''), marked_display_sites:marked, static_source_segments:sources.length});
      for (const source of sources) for (const word of source.match(/\b[A-Za-z]+\b/g) || []) {
        const lower = word.toLowerCase();
        if (!glossary.te[lower]) fallbacks.set(lower,(fallbacks.get(lower)||0)+1);
      }
    }
  }
}
scan(root+'frontend/src');
const app=readFileSync(root+'frontend/src/App.jsx','utf8');
const routes=[...app.matchAll(/path="([^"]+)"/g)].map((match)=>match[1]);
const data={routes,files,english_fallbacks:[...fallbacks].sort((a,b)=>b[1]-a[1]),notes:['Marks system source literals; dynamic data stays unchanged.','Counts are static provenance checks, not a claim that every runtime string has been reviewed.','Dynamic backend errors, notifications with interpolated data, custom catalogue names, and mixed-origin helper strings need manual audit.']};
writeFileSync(root+'shared/transliteration/coverage.json',JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({routes:routes.length,files:files.length,marked:files.reduce((sum,file)=>sum+file.marked_display_sites,0),top_fallbacks:data.english_fallbacks.slice(0,50)},null,2));
