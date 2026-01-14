const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', '..', 'data', 'holdtraening-source.txt');

function readHoldtraeningRaw() {
  return fs.readFileSync(dataPath, 'utf8');
}

function writeHoldtraeningRaw(text) {
  fs.writeFileSync(dataPath, text);
}

if (require.main === module) {
  process.stdout.write(readHoldtraeningRaw());
}

module.exports = {
  dataPath,
  readHoldtraeningRaw,
  writeHoldtraeningRaw,
};
