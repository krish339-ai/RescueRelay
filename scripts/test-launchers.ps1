# Integration test: actual batch files, processes, ports and a temporary mapped drive.
# Run from Windows PowerShell: .\scripts\test-launchers.ps1
# Requires Node 24/npm 11 on PATH and free ports 4000/5173; never stops port owners.
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('rescuerelay-launchers-' + [Guid]::NewGuid().ToString('N'))
$fixture = Join-Path $testRoot 'Rescue Relay & Co'
$mapping = $null
$sentinel = $null
$blocker = $null
$utf8 = New-Object Text.UTF8Encoding($false)
$previousNoninteractive = $env:RESCUERELAY_NONINTERACTIVE
$previousExternalCalls = $env:AI_EXTERNAL_CALLS_ENABLED
$env:AI_EXTERNAL_CALLS_ENABLED = $null
$env:RESCUERELAY_NONINTERACTIVE = '1'
$passed = 0
function Assert($condition, $message) {
    if (!$condition) { throw $message }
    $script:passed++
    Write-Host "PASS: $message"
}
function Batch($name, $expected = 0) {
    $result = & $env:ComSpec /d /s /c ('call "' + (Join-Path $fixture ($name + '.bat')) + '"') 2>&1
    $code = $LASTEXITCODE
    Write-Host ($result -join [Environment]::NewLine)
    Assert ($code -eq $expected) "$name.bat exits $expected"
}
function State { Get-Content -LiteralPath (Join-Path $fixture '.rescuerelay/dev.json') -Raw | ConvertFrom-Json }
function Alive($process) { $process.Refresh(); return !$process.HasExited }
function Wait-Health {
    for ($i=0; $i -lt 30; $i++) {
        try { if ((Invoke-RestMethod 'http://127.0.0.1:4000/api/health' -TimeoutSec 1).status -eq 'ok') { return } } catch { }
        Start-Sleep -Milliseconds 200
    }
    throw 'Fixture health did not become ready.'
}
try {
    $listeners = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    if (@($listeners | Where-Object { $_.Port -in @(4000,5173) }).Count) { throw 'Tests require ports 4000/5173 free. Existing owners were not stopped.' }
    New-Item -ItemType Directory -Path (Join-Path $fixture 'scripts') -Force | Out-Null
    foreach ($file in @('start.bat','stop.bat','restart.bat','scripts/dev.ps1','scripts/dev-job.cs','scripts/dev-command.bat')) {
        Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination (Join-Path $fixture $file)
    }
    [IO.File]::WriteAllText((Join-Path $fixture 'package.json'), '{"name":"rescuerelay-launcher-test","private":true,"scripts":{"dev":"node server.cjs"}}', $utf8)
    [IO.File]::WriteAllText((Join-Path $fixture 'server.cjs'), 'const http=require("node:http");try{process.loadEnvFile(".env")}catch(e){if(e.code!=="ENOENT")throw e}for(const port of [4000,5173])http.createServer((req,res)=>{res.setHeader("Content-Type",port===4000?"application/json":"text/html");res.end(port===4000?JSON.stringify({status:"ok",externalCallsEnabled:process.env.AI_EXTERNAL_CALLS_ENABLED==="true"}):"<title>RescueRelay launcher fixture</title>")}).listen(port,"127.0.0.1");', $utf8)
    # A free temporary DOS drive tests real drive changes, not string inspection.
    foreach ($letter in @('Z','Y','X','W','V')) {
        if (!(Test-Path ($letter + ':\')) -and !([IO.DriveInfo]::GetDrives().Name -contains ($letter + ':\'))) {
            & subst.exe ($letter + ':') $testRoot
            if ($LASTEXITCODE -eq 0) { $mapping = $letter + ':'; $fixture = Join-Path ($mapping + '\') 'Rescue Relay & Co'; break }
        }
    }
    if (!$mapping) { throw 'No safe temporary drive mapping was available; cross-drive test was not run.' }
    Push-Location $env:SystemRoot
    Batch 'start' 1 # No dependencies, useful refusal.
    foreach ($name in @('concurrently','tsx','vite')) {
        New-Item -ItemType Directory -Path (Join-Path $fixture 'node_modules/.bin') -Force | Out-Null
        [IO.File]::WriteAllText((Join-Path $fixture ('node_modules/.bin/' + $name + '.cmd')), '@rem fixture prerequisite marker', $utf8)
    }
    # An unrelated Node process survives every launcher operation.
    $node = (Get-Command node.exe).Source
    $sentinel = Start-Process $node -ArgumentList '-e "setInterval(()=>{},1000)"' -WindowStyle Hidden -PassThru
    $sentinelHandle = $sentinel.Handle
    Batch 'start'
    Wait-Health
    Assert (!(Invoke-RestMethod 'http://127.0.0.1:4000/api/health').externalCallsEnabled) 'External AI defaults off without configuration'
    $first = State
    Batch 'start'
    Assert ((State).token -eq $first.token) 'Repeated start keeps the same supervisor and launch token'
    Assert (Alive $sentinel) 'Unrelated Node process survives start'
    Batch 'stop'
    Assert (!(Test-Path -LiteralPath (Join-Path $fixture '.rescuerelay/dev.json'))) 'Stop clears the owned runtime state'
    $remaining = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    Assert (@($remaining | Where-Object { $_.Port -in @(4000,5173) }).Count -eq 0) 'Both owned listener processes stopped'
    Batch 'stop'
    Assert (Alive $sentinel) 'Unrelated Node process survives repeated stop'
    # Simulate a stale PID reused by a live unrelated process.
    $stale = @{root=$fixture;token=[Guid]::NewGuid().ToString('N');pid=$sentinel.Id;started='1';status='running'}
    [IO.File]::WriteAllText((Join-Path $fixture '.rescuerelay/dev.json'), ($stale | ConvertTo-Json), $utf8)
    Batch 'stop'
    Assert (Alive $sentinel) 'Stale PID/creation-time mismatch cannot stop a live unrelated process'
    $stale.started = $sentinel.StartTime.ToUniversalTime().Ticks.ToString()
    [IO.File]::WriteAllText((Join-Path $fixture '.rescuerelay/dev.json'), ($stale | ConvertTo-Json), $utf8)
    Batch 'stop'
    Assert (Alive $sentinel) 'Matching PID/time without the expected checkout command/token is rejected'
    Batch 'start'
    $beforeRestart = State
    [IO.File]::WriteAllText((Join-Path $fixture '.env'), 'AI_EXTERNAL_CALLS_ENABLED=true', $utf8)
    Batch 'restart'
    Wait-Health
    Assert ((Invoke-RestMethod 'http://127.0.0.1:4000/api/health').externalCallsEnabled) 'Restart honors explicit external AI opt-in from root .env'
    Assert ((State).token -ne $beforeRestart.token) 'Restart creates a fresh owned session'
    Assert (Alive $sentinel) 'Unrelated Node process survives restart'
    $env:AI_EXTERNAL_CALLS_ENABLED = 'false'
    Batch 'restart'
    Wait-Health
    Assert (!(Invoke-RestMethod 'http://127.0.0.1:4000/api/health').externalCallsEnabled) 'An inherited explicit false overrides root .env'
    $env:AI_EXTERNAL_CALLS_ENABLED = $null
    Batch 'stop'
    # A real unrelated server owns the common port. The launcher must refuse it.
    $blocker = Start-Process $node -ArgumentList '-e "require(''http'').createServer((q,s)=>{s.setHeader(''Content-Type'',''text/plain'');s.end(''unrelated'')}).listen(4000,''127.0.0.1'')"' -WindowStyle Hidden -PassThru
    $blockerHandle = $blocker.Handle
    for ($i=0;$i -lt 30;$i++) {
        try { if ((Invoke-WebRequest 'http://127.0.0.1:4000' -UseBasicParsing -TimeoutSec 1).Content -eq 'unrelated') { break } } catch { }
        Start-Sleep -Milliseconds 200
    }
    Assert (Alive $blocker) 'Unrelated port-owner fixture started'
    Batch 'start' 1
    Batch 'stop'
    Assert ((Invoke-WebRequest 'http://127.0.0.1:4000' -UseBasicParsing -TimeoutSec 1).Content -eq 'unrelated') 'Occupied-port refusal and stop preserve the unrelated listener'
    Assert (Alive $sentinel) 'All tests preserve the unrelated Node sentinel'
    Write-Host "$passed assertions passed. Actual launcher path: $fixture"
    Write-Host "Fixture/logs retained at $testRoot"
} finally {
    if (Test-Path -LiteralPath (Join-Path $fixture '.rescuerelay/dev.json')) {
        try { Batch 'stop' } catch { Write-Warning $_ }
    }
    foreach ($ownedTestProcess in @($blocker,$sentinel)) {
        if ($ownedTestProcess -and (Alive $ownedTestProcess)) { $ownedTestProcess.Kill(); $ownedTestProcess.WaitForExit() }
    }
    if ((Get-Location).Path -eq $env:SystemRoot) { Pop-Location }
    if ($mapping) { & subst.exe $mapping /d }
    $env:RESCUERELAY_NONINTERACTIVE = $previousNoninteractive
    $env:AI_EXTERNAL_CALLS_ENABLED = $previousExternalCalls
}
