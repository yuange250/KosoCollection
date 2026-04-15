import crypto from 'node:crypto';

function commonsUrl(fileName) {
  const h = crypto.createHash('md5').update(fileName).digest('hex');
  return `https://upload.wikimedia.org/wikipedia/commons/${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(fileName)}`;
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node scripts/gen-commons-urls.mjs File1.jpg "File Two.jpg"');
  process.exit(1);
}
for (const f of files) {
  console.log(commonsUrl(f));
}
