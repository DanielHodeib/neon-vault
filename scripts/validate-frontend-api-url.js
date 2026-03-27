const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SEARCH_DIRS = ['app', 'components', 'hooks', 'lib'];
const FILE_EXTENSIONS = new Set(['.ts', '.tsx']);
const allowedSchemes = ['http://localhost', 'https://localhost', 'http://127.0.0.1', 'https://127.0.0.1'];

function walk(dirPath, files = []) {
  if (!fs.existsSync(dirPath)) {
    return files;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, files);
      continue;
    }

    if (FILE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(absolute);
    }
  }

  return files;
}

const hardcodedLocalApiPattern = /(fetch\s*\(|axios(?:\.[a-zA-Z]+)?\s*\()\s*["'`](https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/api\/[^"'`]*)["'`]/g;
const offenders = [];

for (const relativeDir of SEARCH_DIRS) {
  const absoluteDir = path.join(ROOT, relativeDir);
  const files = walk(absoluteDir);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = hardcodedLocalApiPattern.exec(content)) !== null) {
      offenders.push({
        file: path.relative(ROOT, file),
        endpoint: match[2],
      });
    }

    const lower = content.toLowerCase();
    const hasDisallowedLocalhost = allowedSchemes.some((scheme) => lower.includes(scheme + '/api/'));
    if (hasDisallowedLocalhost && !content.includes('NEXT_PUBLIC_API_URL')) {
      offenders.push({
        file: path.relative(ROOT, file),
        endpoint: 'local-api-url-without-next-public-api-url',
      });
    }
  }
}

if (offenders.length > 0) {
  console.error('\n[frontend-api-check] Hardcoded localhost API endpoints detected. Use process.env.NEXT_PUBLIC_API_URL instead.\n');
  offenders.forEach((offender) => {
    console.error(`- ${offender.file}: ${offender.endpoint}`);
  });
  process.exit(1);
}

console.log('[frontend-api-check] OK: no hardcoded localhost API endpoints found in frontend code.');
