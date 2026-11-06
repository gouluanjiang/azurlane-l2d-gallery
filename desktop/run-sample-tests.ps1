param([int]$StartRound=1,[int]$EndRound=5)
$ErrorActionPreference='Stop'
$projectRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$runtimeExe=Join-Path $projectRoot '.desktop-sample\碧蓝航线图鉴.exe'
if($StartRound -lt 1 -or $EndRound -gt 99 -or $StartRound -gt $EndRound){throw 'Invalid test rounds'}
for($round=$StartRound;$round -le $EndRound;$round++){
    $process=Start-Process -FilePath $runtimeExe -ArgumentList @('--sample-self-test','--test-round',([string]$round)) -WorkingDirectory $projectRoot -WindowStyle Normal -PassThru
    Write-Output ("Round {0} started; PID {1}" -f $round,$process.Id)
    if(-not $process.WaitForExit(240000)){throw "Round $round exceeded the process timeout; PID $($process.Id)"}
    $reportFile=Join-Path $projectRoot "verification\two-skin-sample\round-$round\acceptance.json"
    if(-not (Test-Path -LiteralPath $reportFile)){throw "Round $round did not create an acceptance report"}
    $report=Get-Content -LiteralPath $reportFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if($report.status -ne 'passed'){throw "Round $round failed: $($report.error)"}
    $readySteps=@($report.steps | Where-Object {$_.name -in @('old-skin-ready','new-skin-ready')})
    Write-Output (([pscustomobject]@{round=$round;status=$report.status;readyMilliseconds=@($readySteps.milliseconds);steps=@($report.steps).Count;processExited=$true}) | ConvertTo-Json -Compress)
}
