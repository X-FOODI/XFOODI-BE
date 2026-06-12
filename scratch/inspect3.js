const fs = require('fs');
const path = require('path');

function searchDir(dir, query) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchDir(fullPath, query);
    } else if (file.endsWith('.js') || file.endsWith('.cjs') || file.endsWith('.mjs')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes(query)) {
        console.log(`Found "${query}" in ${fullPath}`);
        const index = content.indexOf(query);
        console.log(content.substring(index - 100, index + 1500));
        console.log('---');
      }
    }
  }
}

const runtimeDir = path.join(__dirname, '../node_modules/@copilotkit/runtime/dist');
searchDir(runtimeDir, 'createCopilotRuntimeHandler');
