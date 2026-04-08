import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cjsFile = path.join(root, 'node_modules/uuid/dist/cjs/index.js');
const mainFile = path.join(root, 'node_modules/uuid/dist/index.js');

if (fs.existsSync(mainFile) && !fs.existsSync(cjsFile)) {
	fs.mkdirSync(path.dirname(cjsFile), { recursive: true });
	fs.writeFileSync(cjsFile, "'use strict';\nmodule.exports = require('../index.js');\n", 'utf8');
}
