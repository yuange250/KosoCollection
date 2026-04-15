# 在 Windows 上打包可上传 ECS 的源码包（不含 node_modules）
$Root = Split-Path -Parent $PSScriptRoot
$Stamp = Get-Date -Format "yyyyMMdd"
$Name = "kosoworld-ecs-bundle-$Stamp.zip"
$Out = Join-Path $Root $Name
if (Test-Path $Out) { Remove-Item $Out -Force }
Push-Location $Root
try {
  $items = Get-ChildItem -Force | Where-Object {
    $_.Name -notin @('node_modules', 'dist', '.git', 'local-data') -and
    $_.Name -notlike 'kosoworld-ecs-bundle-*.zip' -and
    $_.Name -notlike 'kosoworld-ecs-bundle-*.tar.gz'
  }
  Compress-Archive -Path $items.FullName -DestinationPath $Out -CompressionLevel Optimal
  Write-Host "已生成: $Out"
  Write-Host "上传到服务器后解压，在解压目录执行: chmod +x deploy/install-ecs.sh && ./deploy/install-ecs.sh"
}
finally {
  Pop-Location
}
