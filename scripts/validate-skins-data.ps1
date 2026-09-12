param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [switch]$MetadataOnly
)

$ErrorActionPreference = 'Stop'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw '需要 Node.js 才能验证图鉴数据。' }
$validatorArgs = @((Join-Path $PSScriptRoot 'validate-catalog.mjs'), '--root', $ProjectRoot)
if ($MetadataOnly) { $validatorArgs += '--metadata-only' }
& $node.Source @validatorArgs
if ($LASTEXITCODE -ne 0) { throw '图鉴数据验证失败，详情见上方输出。' }
