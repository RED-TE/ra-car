const fs = require('fs');
const lines = fs.readFileSync('index.html', 'utf-8').split('\n');
const out = [];
for (let i = 0; i < lines.length; i++) {
    const num = i + 1;
    if (num >= 1 && num <= 720) continue;
    if (num >= 988 && num <= 1709) continue;
    if (num >= 2323 && num <= 2325) continue;
    out.push(lines[i]);
}
fs.writeFileSync('index.html', out.join('\n'));
console.log('Done!');
