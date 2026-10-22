// Fails the job when a ZAP scan found a high-risk alert (overview §15: dynamic scans block on high
// findings). Medium and lower alerts are listed but don't block; they are reviewed in the report.
//   node scripts/ci/zap-gate.mjs zap-report.json
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) throw new Error('usage: node scripts/ci/zap-gate.mjs <ZAP JSON report>');
const report = JSON.parse(readFileSync(file, 'utf8'));
const RISK = ['Informational', 'Low', 'Medium', 'High'];
let high = 0;
for (const site of report.site ?? []) {
  for (const alert of site.alerts ?? []) {
    const risk = Number(alert.riskcode);
    console.log(`${RISK[risk] ?? risk}: ${alert.name} (${alert.alertRef}, ${alert.count ?? alert.instances?.length ?? 0} instances)`);
    if (risk >= 3) high += 1;
  }
}
if (high > 0) {
  console.error(`\n${high} high-risk ZAP alerts. Fix them, or record a reviewed false positive in .zap/rules.tsv.`);
  process.exit(1);
}
console.log('\nNo high-risk ZAP alerts.');
