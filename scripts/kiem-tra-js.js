/** Static syntax gate for the CommonJS baseline (no compilation step). */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const roots = ['server.js', 'db', 'lib', 'middleware', 'public/js', 'routes', 'scripts', 'test'];
const files = [];

function collect(relative) {
    const absolute = path.join(ROOT, relative);
    const stat = fs.statSync(absolute);
    if (stat.isFile()) {
        if (absolute.endsWith('.js') && absolute !== __filename) files.push(absolute);
        return;
    }
    for (const name of fs.readdirSync(absolute)) collect(path.join(relative, name));
}

roots.forEach(collect);
for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) {
        process.stderr.write(result.stderr || result.stdout);
        process.exit(result.status || 1);
    }
}
console.log(`JavaScript syntax check: ${files.length} files passed`);
