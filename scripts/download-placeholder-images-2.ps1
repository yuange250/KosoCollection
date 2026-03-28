$ErrorActionPreference = 'Stop'
$dir = (Join-Path $PSScriptRoot '..\public\images\nodes' | Resolve-Path).Path

function Get-ImageUrl([string]$fileTitle) {
  $t = [uri]::EscapeDataString($fileTitle)
  $raw = curl.exe -s "https://commons.wikimedia.org/w/api.php?action=query&titles=$t&prop=imageinfo&iiprop=url&format=json"
  if ($raw -match '"imageinfo":\[\{"url":"([^"]+)"') {
    return ($Matches[1] -replace '\\/', '/')
  }
  return $null
}

$pairs = @(
  @{ local = 'oblivion-logo-wikimedia.png'; title = 'File:The Elder Scrolls IV Oblivion Remastered logo.png' }
  @{ local = 'portal-logo-wikimedia.svg'; title = 'File:Portal Logo.svg' }
  @{ local = 'journey-logo-wikimedia.svg'; title = 'File:Journey (2012 video game) logo black.svg' }
  @{ local = 'tf2-logo-wikimedia.png'; title = 'File:Team-Fortress-2-logo.png' }
  @{ local = 'battlefield-logo-wikimedia.svg'; title = 'File:BattlefieldLogo.svg' }
  @{ local = 'computer-space-cabinet-wikimedia.jpg'; title = 'File:Computer Space cabinet.jpg' }
  @{ local = 'n64-console-wikimedia.png'; title = 'File:N64-Console-Set.png' }
  @{ local = 'nintendo-ds-lite-wikimedia.jpg'; title = 'File:Nintendo-DS-Lite-Black-Open.jpg' }
  @{ local = 'xbox-360-wikimedia.jpg'; title = 'File:Xbox-360-Pro-wController.jpg' }
  @{ local = 'ps3-console-wikimedia.jpg'; title = 'File:Sony-PlayStation-3-2001A-wController-L.jpg' }
  @{ local = 'ps5-console-wikimedia.jpg'; title = 'File:PlayStation 5 and DualSense.jpg' }
  @{ local = 'sega-saturn-wikimedia.jpg'; title = 'File:Sega-Saturn-Console-Set-Mk2.jpg' }
  @{ local = 'dreamcast-console-wikimedia.jpg'; title = 'File:Dreamcast-Console-Set.jpg' }
  @{ local = 'xbox-original-wikimedia.jpg'; title = 'File:Xbox-console.jpg' }
  @{ local = 'atari-et-burial-wikimedia.jpg'; title = 'File:Atari E.T. Dig- Alamogordo, New Mexico (14036097792).jpg' }
  @{ local = 'famiclone-genius-wikimedia.jpg'; title = 'File:Famiclone Genius Micro IQ-201.jpg' }
  @{ local = 'internet-cafe-china-wikimedia.jpg'; title = 'File:Qufu - Dongguan - internet cafe - P1060318.JPG' }
  @{ local = 'smartphone-game-icons-wikimedia.svg'; title = 'File:Smartphone - game-icons.svg' }
  @{ local = 'igf-expo-2013-wikimedia.jpg'; title = 'File:Game Developers Conference 2013 - Independent Games Festival Expo.jpg' }
  @{ local = 'oculus-rift-cv1-wikimedia.jpg'; title = 'File:Oculus-Rift-CV1-Headset-Front.jpg' }
  @{ local = 'e3-2022-logo-wikimedia.svg'; title = 'File:E3 2022 logo.svg' }
  @{ local = 'steam-2016-logo-wikimedia.svg'; title = 'File:Steam 2016 logo black.svg' }
  @{ local = 'sega-dreamcast-fl-wikimedia.jpg'; title = 'File:Sega-Dreamcast-Console-FL.jpg' }
  @{ local = 'igf-logo-wikimedia.svg'; title = 'File:Independent Games Festival Logo.svg' }
  @{ local = 'kojima-productions-wikimedia.png'; title = 'File:Kojima Productiones.png' }
  @{ local = 'john-carmack-gdc-wikimedia.jpg'; title = 'File:John Carmack GDC 2010.jpg' }
  @{ local = 'miyamoto-2015-wikimedia.jpg'; title = 'File:Shigeru Miyamoto 20150610 (cropped).jpg' }
)

foreach ($p in $pairs) {
  $u = Get-ImageUrl $p.title
  if (-not $u) { Write-Warning "no URL: $($p.title)"; continue }
  $out = Join-Path $dir $p.local
  Write-Host $p.local
  curl.exe -s -L -o $out $u
  if ($LASTEXITCODE -ne 0) { Write-Warning "curl fail $($p.local)" }
  elseif ((Get-Item $out).Length -lt 80) { Write-Warning "tiny $($p.local)" }
  Start-Sleep -Milliseconds 350
}
