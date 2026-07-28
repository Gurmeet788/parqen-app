const fs = require('fs');
const parser = require('@babel/parser');

const code = fs.readFileSync('./src/pages/TradeDetail.js', 'utf8');

try {
  parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx']
  });
  console.log('Parsed successfully!');
} catch (e) {
  console.error('Parse error:', e.message);
  if (e.loc) {
    console.error('Error location:', e.loc);
    // Print 30 lines around the error location
    const lines = code.split('\n');
    const start = Math.max(0, e.loc.line - 15);
    const end = Math.min(lines.length, e.loc.line + 15);
    console.error('Code context:');
    for (let i = start; i < end; i++) {
      console.error(`${i + 1}: ${lines[i]}`);
    }
  }
}
