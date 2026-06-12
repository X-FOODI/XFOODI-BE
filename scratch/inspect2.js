const fs = require('fs');
const path = require('path');

const expressPath = path.join(__dirname, '../node_modules/@copilotkit/runtime/dist/v2/express.cjs');
if (fs.existsSync(expressPath)) {
  const expressContent = fs.readFileSync(expressPath, 'utf8');
  console.log('express.cjs first 1000 chars:');
  console.log(expressContent.substring(0, 1000));
} else {
  console.log('express.cjs does not exist');
}
