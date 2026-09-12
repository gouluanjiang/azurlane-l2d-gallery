param([switch]$Rollback)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
try {
  $nodeCommand = Get-Command node -ErrorAction Stop
  $nodeVersion = & $nodeCommand.Source -p 'Number(process.versions.node.split(".")[0])'
  if ([int]$nodeVersion -lt 22) { throw '请安装 Node.js 22 或更新版本。' }
  $arguments = @((Join-Path $PSScriptRoot 'sync.mjs'))
  if ($Rollback) { $arguments += '--rollback' }
  & $nodeCommand.Source @arguments
  if ($LASTEXITCODE -ne 0) { throw '同步未完成，详细原因见上方；现有图鉴已保留。' }
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
