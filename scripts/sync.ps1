param([switch]$Rollback, [switch]$CheckSources)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
try {
  if ($Rollback -and $CheckSources) { throw '回退与检查新资料不能同时运行。' }
  $nodeCommand = Get-Command node -ErrorAction Stop
  $nodeVersion = & $nodeCommand.Source --version
  if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22) { throw '请安装 Node.js 22 或更新版本。' }
  $arguments = @((Join-Path $PSScriptRoot 'sync.mjs'))
  if ($Rollback) { $arguments += '--rollback' }
  if ($CheckSources) { $arguments = @((Join-Path $PSScriptRoot 'check-updates.mjs'), '--apply-local') }
  & $nodeCommand.Source @arguments
  if ($LASTEXITCODE -ne 0) { throw '同步未完成，详细原因见上方；现有图鉴已保留。' }
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
