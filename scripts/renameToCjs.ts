import fs from 'fs-extra';
import path from 'path';

const CJS_PATH = 'dist/cjs';

if (fs.existsSync(CJS_PATH)) {
  const items = fs.readdirSync(CJS_PATH);
  for (const item of items) {
    if (item.endsWith('.js')) {
      const itemPath = path.join(CJS_PATH, item);
      const { name } = path.parse(itemPath);
      fs.renameSync(itemPath, path.join(CJS_PATH, `${name}.cjs`));
    }
  }
}
