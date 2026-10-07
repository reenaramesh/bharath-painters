import { createRequire } from 'node:module';
const { transformAsync } = createRequire(new URL('../../frontend/package.json', import.meta.url))('@babel/core');
import systemCopyPlugin from './ui-plugin.mjs';

export function systemCopy() {
  return {
    name: 'bharath-static-system-copy', enforce: 'pre',
    async transform(code, id) {
      const normalized = id.replaceAll('\\', '/');
      if (!normalized.includes('/src/') || !/\.jsx$/.test(normalized) || /\/src\/(?:i18n|preview)\//.test(normalized)) return null;
      const result = await transformAsync(code, { filename: id, babelrc: false, configFile: false, parserOpts: { plugins: ['jsx'] }, plugins: [systemCopyPlugin], sourceMaps: true });
      return { code: result.code, map: result.map };
    },
  };
}
