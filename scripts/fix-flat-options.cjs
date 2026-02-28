#!/usr/bin/env node
// Fix flat-string options in all module.json files (except islamic-finance, already fixed)
// Converts: "Primary care" → {"value": "primary-care", "label": "Primary care"}

const fs = require('fs');
const path = require('path');

function toValue(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function findModuleFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findModuleFiles(full));
    else if (entry.name === 'module.json') results.push(full);
  }
  return results;
}

const areasDir = path.join(__dirname, '..', 'server', 'areas');
const files = findModuleFiles(areasDir).filter(f => !f.includes('islamic-finance'));

let totalFiles = 0;
let totalOptions = 0;

for (const f of files) {
  let data;
  try { data = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {
    console.error('Parse error:', f, e.message);
    continue;
  }

  const inputsKey = data.guidedInputs ? 'guidedInputs' : (data.inputs ? 'inputs' : null);
  if (!inputsKey) continue;

  let changed = false;
  for (const inp of data[inputsKey]) {
    if (inp.options && inp.options.some(o => typeof o === 'string')) {
      inp.options = inp.options.map(o => {
        if (typeof o === 'string') {
          totalOptions++;
          return { value: toValue(o), label: o };
        }
        return o; // already object
      });
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(f, JSON.stringify(data, null, 2) + '\n', 'utf8');
    totalFiles++;
    console.log('Fixed:', path.relative(areasDir, f));
  }
}

console.log(`\nDone. Fixed ${totalOptions} options across ${totalFiles} files.`);
