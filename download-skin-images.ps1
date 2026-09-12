$ErrorActionPreference = 'Stop'
$target = Join-Path $PSScriptRoot 'assets\skins'
New-Item -ItemType Directory -Path $target -Force | Out-Null
$html = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'index.html') -Raw -Encoding UTF8
$matches = [regex]::Matches($html, "\['([^']+)','[^']*','([^']+)'", 'Multiline')
$api = 'https://wiki.biligame.com/blhx/api.php'
$downloaded = 0
$headers = @{
    'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36'
    'Referer' = 'https://wiki.biligame.com/blhx/'
}

for ($i = 0; $i -lt $matches.Count; $i++) {
    $character = $matches[$i].Groups[1].Value
    $slot = $matches[$i].Groups[2].Value
    $title = 'File:' + $character + $slot + '.jpg'
    $number = ($i + 1).ToString('000')
    $destination = Join-Path $target ($number + '.jpg')
    if (Test-Path -LiteralPath $destination) {
        $downloaded++
        Write-Output ($number + ' SKIP ' + $title)
        continue
    }
    $query = $api + '?action=query&prop=imageinfo&iiprop=url&format=json&titles=' + [uri]::EscapeDataString($title)
    $response = Invoke-RestMethod -Uri $query -Headers $headers
    $page = @($response.query.pages.psobject.Properties.Value)[0]
    $url = $page.imageinfo[0].url
    if (-not $url) {
        Write-Output ($number + ' MISSING ' + $title)
        continue
    }
    Invoke-WebRequest -Uri $url -Headers $headers -OutFile $destination
    $downloaded++
    Write-Output ($number + ' OK ' + $title)
    Start-Sleep -Milliseconds 120
}
Write-Output ('Downloaded ' + $downloaded + '/' + $matches.Count)
