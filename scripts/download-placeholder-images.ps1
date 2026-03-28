$ErrorActionPreference = 'Stop'
$dir = Join-Path $PSScriptRoot '..\public\images\nodes' | Resolve-Path

function Get-CommonsImageUrl([string]$fileTitle) {
  $t = [uri]::EscapeDataString($fileTitle)
  $raw = curl.exe -s "https://commons.wikimedia.org/w/api.php?action=query&titles=$t&prop=imageinfo&iiprop=url&format=json"
  if ($raw -match '"url"\s*:\s*"([^"]+)"') {
    return $Matches[1].Replace('\\/', '/').Replace('\/', '/')
  }
  return $null
}

$pairs = @(
  @{ local = 'super-mario-64-logo-wikimedia.png'; title = 'File:Super Mario 64 logo.png' }
  @{ local = 'pokemon-intl-logo-wikimedia.svg'; title = 'File:International Pokémon logo.svg' }
  @{ local = 'pac-man-logo-wikimedia.png'; title = 'File:PAC-MAN logo.png' }
  @{ local = 'metroid-logo-wikimedia.png'; title = 'File:Metroid-Logo.png' }
  @{ local = 'donkey-kong-1981-title-wikimedia.png'; title = 'File:Donkey Kong (1981) NES title screen.png' }
  @{ local = 'contra-logo-wikimedia.svg'; title = 'File:Contra logo black.svg' }
  @{ local = 'civilization-logo-wikimedia.svg'; title = 'File:Civilization Brand Logo NavBar gold.svg' }
  @{ local = 'warcraft-logo-wikimedia.jpeg'; title = 'File:Logo de Warcraft.jpeg' }
  @{ local = 'gran-turismo-logo-wikimedia.svg'; title = 'File:Gran turismo square series logo (coloured).svg' }
  @{ local = 'goldeneye-007-logo-wikimedia.svg'; title = 'File:007 Logo.svg' }
  @{ local = 'starcraft-logo-wikimedia.svg'; title = 'File:StarCraft logo.svg' }
  @{ local = 'mgs-logo-wikimedia.svg'; title = 'File:Metal Gear Solid logo black.svg' }
  @{ local = 'warcraft3-wcg-2006-wikimedia.jpg'; title = 'File:WCG 2006 Warcraft 3 Winners.jpg' }
  @{ local = 'halo-2-logo-wikimedia.jpg'; title = 'File:Halo2 blackbg logo.jpg' }
  @{ local = 'oblivion-logo-wikimedia.png'; title = 'File:The Elder Scrolls IV Oblivion Remastered logo.png' }
  @{ local = 'cod4-mw-logo-wikimedia.jpg'; title = 'File:Call of Duty 4 Modern Warfare Logo.jpg' }
  @{ local = 'portal-logo-wikimedia.svg'; title = 'File:Portal Logo.svg' }
  @{ local = 'skyrim-logo-wikimedia.png'; title = 'File:The Elder Scrolls V - Skyrim logo.png' }
  @{ local = 'journey-logo-wikimedia.svg'; title = 'File:Journey (2012 video game) logo black.svg' }
  @{ local = 'tf2-logo-wikimedia.png'; title = 'File:Team-Fortress-2-logo.png' }
  @{ local = 'fortnite-logo-wikimedia.svg'; title = 'File:Fortnite logo 2.svg' }
  @{ local = 'battlefield-logo-wikimedia.svg'; title = 'File:BattlefieldLogo.svg' }
  @{ local = 'computer-space-cabinet-wikimedia.jpg'; title = 'File:Computer Space cabinet.jpg' }
  @{ local = 'n64-console-wikimedia.png'; title = 'File:N64-Console-Set.png' }
  @{ local = 'nintendo-ds-lite-wikimedia.jpg'; title = 'File:Nintendo-DS-Lite-Black-Open.jpg' }
  @{ local = 'xbox-360-wikimedia.jpg'; title = 'File:Xbox-360-Pro-wController.jpg' }
  @{ local = 'ps3-console-wikimedia.jpg'; title = 'File:Sony-PlayStation-3-2001A-wController-L.jpg' }
  @{ local = 'ps5-console-wikimedia.jpg'; title = 'File:PlayStation 5 and DualSense.jpg' }
  @{ local = 'sega-mega-drive-jp-wikimedia.jpg'; title = 'File:Sega-Mega-Drive-JP-Mk1-Console-Set.jpg' }
  @{ local = 'sega-saturn-wikimedia.jpg'; title = 'File:Sega-Saturn-Console-Set-Mk2.jpg' }
  @{ local = 'dreamcast-console-wikimedia.jpg'; title = 'File:Dreamcast-Console-Set.jpg' }
  @{ local = 'ps2-versions-wikimedia.jpg'; title = 'File:PS2-Versions.jpg' }
  @{ local = 'xbox-original-wikimedia.jpg'; title = 'File:Xbox-console.jpg' }
  @{ local = 'psp-1000-wikimedia.jpg'; title = 'File:Psp-1000.jpg' }
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
  $u = Get-CommonsImageUrl $p.title
  if (-not $u) { Write-Warning "SKIP no URL: $($p.title)"; continue }
  $out = Join-Path $dir $p.local
  Write-Host "GET $($p.local)"
  curl.exe -s -L -o $out $u
  if ($LASTEXITCODE -ne 0) { Write-Warning "curl failed: $($p.local)"; continue }
  if ((Get-Item $out).Length -lt 50) { Write-Warning "tiny file: $($p.local)" }
}

Write-Host "Done."
