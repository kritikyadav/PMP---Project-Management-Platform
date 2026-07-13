const fs = require('fs');
const path = require('path');

function walk(dir) {
  fs.readdirSync(dir).forEach(f => {
    let p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      walk(p);
    } else if (p.endsWith('.ts')) {
      let c = fs.readFileSync(p, 'utf8');
      let nc = c.replace(/from\s+['"](\.\.?\/[^'"]+)\.js['"]/g, "from '$1'")
                .replace(/jest\.mock\(['"](\.\.?\/[^'"]+)\.js['"]/g, "jest.mock('$1'");
      if (c !== nc) {
        fs.writeFileSync(p, nc);
      }
    }
  });
}

walk('./src');
console.log('Fixed imports again');
