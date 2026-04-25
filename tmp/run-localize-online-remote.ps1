Set-Location "C:\codes\KosoCollection"

while ($true) {
  $ids = @'
const fs = require('fs');
const data = fs.readFileSync('C:/codes/KosoCollection/src/lib/worldsceneData.ts','utf8');
const gallery = fs.readFileSync('C:/codes/KosoCollection/src/lib/worldsceneCandidateGallery.ts','utf8');
const onlineIds = new Set([...data.matchAll(/id:\s*['\"]([^'\"]+)['\"]/g)].map(m=>m[1]));
const positions = [...gallery.matchAll(/(^|\n)\s*['\"]([^'\"]+)['\"]:\s*\{/g)].map(m => ({id:m[2], index:m.index + m[1].length}));
const remote = [];
for (let i=0;i<positions.length;i++) {
  const {id,index} = positions[i];
  if (!onlineIds.has(id)) continue;
  const end = i + 1 < positions.length ? positions[i+1].index : gallery.length;
  const block = gallery.slice(index, end);
  const um = block.match(/url:\s*["']([^"']+)["']/);
  if (!um) continue;
  if (/^https?:\/\//.test(um[1])) remote.push(id);
}
process.stdout.write(remote.slice(0,40).join(','));
'@ | node -

  if ([string]::IsNullOrWhiteSpace($ids)) {
    break
  }

  $env:ONLY_IDS = $ids.Trim()
  node scripts/localize-online-candidate-gallery.mjs 40

  if ($LASTEXITCODE -ne 0) {
    break
  }

  Start-Sleep -Seconds 2
}

Remove-Item Env:ONLY_IDS -ErrorAction SilentlyContinue
