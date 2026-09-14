const { engines } = require("../package.json");

function supportsNodeVersion(version, range = engines.node) {
  const minimum = /^>=(\d+)\.(\d+)\.(\d+)$/.exec(range);
  if (!minimum) throw new Error(`Unsupported Node engine range: ${range}`);
  const actual = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!actual) return false;
  for (let part = 1; part <= 3; part += 1) {
    if (Number(actual[part]) !== Number(minimum[part])) {
      return Number(actual[part]) > Number(minimum[part]);
    }
  }
  return true;
}

exports.supportsNodeVersion = supportsNodeVersion;

if (require.main === module && !supportsNodeVersion(process.versions.node)) {
  console.error(`Node.js ${engines.node} is required by package.json; found ${process.versions.node}.`);
  process.exitCode = 1;
}
