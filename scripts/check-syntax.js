const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sourceDirectories = ['js', 'src', 'scripts'];
const files = [path.join(projectRoot, 'server.js')];

for (const directory of sourceDirectories) {
  const directoryPath = path.join(projectRoot, directory);
  for (const name of fs.readdirSync(directoryPath)) {
    if (name.endsWith('.js') && name !== 'check-syntax.js') {
      files.push(path.join(directoryPath, name));
    }
  }
}

for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

console.log(`Syntax check passed for ${files.length} JavaScript files.`);
