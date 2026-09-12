param([string]$GhPath = '')
$ErrorActionPreference = 'Stop'
if (-not $GhPath) { $GhPath = (Get-Command gh -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $GhPath -PathType Leaf)) { throw '找不到 GitHub CLI，请安装后提供 -GhPath。' }
& $GhPath auth status
if ($LASTEXITCODE -ne 0) { throw 'GitHub 尚未登录，请先运行 gh auth login。' }
@{ ghPath = (Resolve-Path -LiteralPath $GhPath).Path } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'local-config.json') -Encoding UTF8
Write-Host '配置已保存，现在可以双击“一键更新.cmd”。'
