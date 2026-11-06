param([int]$StartRound=1,[int]$EndRound=2,[ValidateSet(1,2,3,4)][int]$Batch=4,[ValidateSet('auto','regression','portraits','interaction')][string]$Mode='auto',[ValidatePattern('^$|^azl-[a-f0-9]{16}$')][string]$OnlySkin='')
$ErrorActionPreference='Stop'
$projectRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$runtimeExe=Join-Path $projectRoot ".desktop-batch-$Batch\碧蓝航线图鉴.exe"
if($StartRound -lt 1 -or $EndRound -gt 99 -or $StartRound -gt $EndRound){throw 'Invalid test rounds'}
if($OnlySkin -and $Mode -ne 'interaction'){throw 'A focused diagnostic requires -Mode interaction'}
for($round=$StartRound;$round -le $EndRound;$round++){
    $startedAt=[DateTime]::UtcNow
    $outputFolder=Join-Path $projectRoot "verification\batch-$Batch\round-$round"
    $testProfile=Join-Path $projectRoot ".desktop-data\batch-$Batch-self-test\round-$round"
    if((Test-Path -LiteralPath (Join-Path $outputFolder 'acceptance.json')) -or (Test-Path -LiteralPath $testProfile)){throw "Round $round already has evidence or a test profile; use a new round number and -Mode to retry"}
    New-Item -ItemType Directory -Force -Path $outputFolder | Out-Null
    $testArguments=@('--sample-self-test','--test-round',([string]$round))
    if($Mode -ne 'auto'){$testArguments+=@('--test-mode',$Mode)}
    if($OnlySkin){$testArguments+=@('--test-only-skin',$OnlySkin)}
    $process=Start-Process -FilePath $runtimeExe -ArgumentList $testArguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardError (Join-Path $outputFolder "stderr.txt") -RedirectStandardOutput (Join-Path $outputFolder "stdout.txt") -PassThru
    $trackedProcessHandle=$process.Handle
    Write-Output ("Round {0} started; PID {1}" -f $round,$process.Id)
    if(-not $process.WaitForExit(600000)){throw "Round $round exceeded the process timeout; PID $($process.Id)"}
    $process.Refresh()
    $reportFile=Join-Path $outputFolder 'acceptance.json'
    if(-not (Test-Path -LiteralPath $reportFile)){throw "Round $round did not create an acceptance report"}
    $report=Get-Content -LiteralPath $reportFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $reportStartUtc=if($report.startedAt -is [DateTime]){$report.startedAt.ToUniversalTime()}else{[DateTimeOffset]::Parse([string]$report.startedAt,[Globalization.CultureInfo]::InvariantCulture).UtcDateTime}
    if($reportStartUtc -lt $startedAt.AddSeconds(-2)){throw 'Stale acceptance report'}
    if($report.status -ne 'passed' -or $process.ExitCode -ne 0){throw "Round $round failed: $($report.error)"}
    $readySteps=@($report.steps | Where-Object {$_.sampleId -and $_.milliseconds})
    ([pscustomobject]@{round=$round;status=$report.status;startedAt=$report.startedAt;finishedAt=$report.finishedAt;exitCode=$process.ExitCode;processExited=$process.HasExited;skins=$readySteps.Count}) | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $outputFolder "process.json") -Encoding UTF8
    Write-Output (([pscustomobject]@{round=$round;status=$report.status;readyMilliseconds=@($readySteps.milliseconds);skins=$readySteps.Count;steps=@($report.steps).Count;processExited=$true;exitCode=$process.ExitCode}) | ConvertTo-Json -Compress)
}
