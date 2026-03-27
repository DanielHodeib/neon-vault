const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'store', 'useCasinoStore.ts');

if (!fs.existsSync(target)) {
  console.error('[viprank-check] store/useCasinoStore.ts was not found.');
  process.exit(1);
}

const content = fs.readFileSync(target, 'utf8');
const expectedExport = /export\s+type\s+VipRank\s*=\s*['\"]Bronze['\"]/;

if (!expectedExport.test(content)) {
  console.error('[viprank-check] Missing or invalid VipRank export in store/useCasinoStore.ts');
  process.exit(1);
}

console.log('[viprank-check] OK: VipRank export is present.');
