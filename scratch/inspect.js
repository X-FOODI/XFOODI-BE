const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../node_modules/@copilotkit/runtime/dist/index.cjs');
const content = fs.readFileSync(filePath, 'utf8');

// Find function copilotRuntimeNodeExpressEndpoint definition
const regex = /copilotRuntimeNodeExpressEndpoint\s*=\s*(?:function|[\s\S]*?=>)/g;
let match;
let count = 0;
// Just search for the actual function definition of copilotRuntimeNodeExpressEndpoint
const searchStr = 'function copilotRuntimeNodeExpressEndpoint';
const idx = content.indexOf(searchStr);
if (idx !== -1) {
  console.log('Found definition of copilotRuntimeNodeExpressEndpoint:');
  console.log(content.substring(idx, idx + 2000));
} else {
  // Let's search for "copilotRuntimeNodeExpressEndpoint =" or similar
  const idx2 = content.indexOf('copilotRuntimeNodeExpressEndpoint:');
  if (idx2 !== -1) {
    console.log('Found property of copilotRuntimeNodeExpressEndpoint:');
    console.log(content.substring(idx2, idx2 + 2000));
  } else {
    // Let's search case insensitively or print occurrences
    console.log('Searching for occurrences of "ExpressEndpoint"...');
    let pos = 0;
    while ((pos = content.indexOf('ExpressEndpoint', pos)) !== -1) {
      console.log('Occurrence:', content.substring(pos - 50, pos + 150));
      pos += 15;
    }
  }
}
