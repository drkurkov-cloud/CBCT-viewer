import fs from 'node:fs';

const allowed = /^(MIT|Apache-2\.0|BSD(?:-2-Clause|-3-Clause)?|ISC|0BSD|BlueOak-1\.0\.0|CC0-1\.0|Unlicense|LGPL-2\.1(?:-or-later)?|LGPL-3\.0(?:-or-later)?)$/;
const production = ['@cornerstonejs/core', '@cornerstonejs/dicom-image-loader', '@cornerstonejs/tools', 'dicom-parser', '7zip-bin'];
const failures = [];
for (const name of production) {
  const packagePath = new URL(`../node_modules/${name}/package.json`, import.meta.url);
  const metadata = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const license = typeof metadata.license === 'string' ? metadata.license : '';
  console.log(`${name}: ${license || 'UNKNOWN'}`);
  if (!allowed.test(license)) failures.push(`${name}: ${license || 'UNKNOWN'}`);
}
if (failures.length) {
  console.error(`Disallowed or unknown production licenses:\n${failures.join('\n')}`);
  process.exit(1);
}
