// Fails the job when OSV-Scanner found a high or critical vulnerability (CVSS 7.0 or more) that
// isn't accepted in osv-scanner.toml (overview §15: block on critical or high findings).
//   osv-scanner scan source --lockfile package-lock.json --format json > osv.json || true
//   node scripts/ci/osv-gate.mjs osv.json
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) throw new Error('usage: node scripts/ci/osv-gate.mjs <OSV JSON report>');
const report = JSON.parse(readFileSync(file, 'utf8'));
let blocking = 0;
for (const result of report.results ?? []) {
  for (const pkg of result.packages ?? []) {
    for (const group of pkg.groups ?? []) {
      // No score at all counts as high: an unknown severity must not slip through (fail-safe).
      const score = group.max_severity === '' || group.max_severity === undefined ? 10 : Number(group.max_severity);
      const level = score >= 7 ? 'BLOCKING' : 'note';
      console.log(`${level}: ${pkg.package.name}@${pkg.package.version} ${group.ids.join(', ')} (severity ${group.max_severity || 'unknown'})`);
      if (score >= 7) blocking += 1;
    }
  }
}
if (blocking > 0) {
  console.error(`\n${blocking} high or critical vulnerabilities. Update the package, or accept it in osv-scanner.toml with a reason and an expiry date.`);
  process.exit(1);
}
console.log('\nNo high or critical vulnerabilities.');
