param([Parameter(Mandatory=$true)][string]$ProjectRoot, [Parameter(Mandatory=$true)][string]$OutputName)
$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).ProviderPath
Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap(128,128)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(8,26,47))
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(26,63,94))
$graphics.FillEllipse($brush,5,5,118,118)
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(104,226,240),8)
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawEllipse($pen,54,24,20,20)
$graphics.DrawLine($pen,64,44,64,94)
$graphics.DrawLine($pen,44,57,84,57)
$graphics.DrawArc($pen,31,47,66,54,0,180)
$graphics.DrawLine($pen,31,74,27,65)
$graphics.DrawLine($pen,97,74,101,65)
$bitmap.Save((Join-Path $ProjectRoot 'desktop\icon.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream = [IO.File]::Create((Join-Path $ProjectRoot 'desktop\icon.ico'))
try { $icon.Save($stream) } finally { $stream.Dispose(); $icon.Dispose(); $graphics.Dispose(); $pen.Dispose(); $brush.Dispose(); $bitmap.Dispose() }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:winexe /platform:anycpu /optimize+ /codepage:65001 /reference:System.Windows.Forms.dll (('/out:') + (Join-Path $ProjectRoot $OutputName)) (('/win32icon:') + (Join-Path $ProjectRoot 'desktop\icon.ico')) (('/win32manifest:') + (Join-Path $ProjectRoot 'desktop\app.manifest')) (Join-Path $ProjectRoot 'desktop\Launcher.cs')
if ($LASTEXITCODE -ne 0) { throw '桌面入口编译失败' }
