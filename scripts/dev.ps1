# Windows PowerShell 5.1+, Windows 10/11. Never changes execution policy.
[CmdletBinding()]
param(
    [ValidateSet('start','stop','restart','run')][string]$Action = 'start',
    [string]$Token
)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$helper = Join-Path $PSScriptRoot 'dev.ps1'
$runtime = Join-Path $repoRoot '.rescuerelay'
$stateFile = Join-Path $runtime 'dev.json'
$utf8 = New-Object Text.UTF8Encoding($false)
$job = $null
$mutex = $null
$locked = $false

function Read-State {
    if (!(Test-Path -LiteralPath $stateFile)) { return $null }
    try { return Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json }
    catch { throw 'Launcher state is unreadable. No processes were stopped. Inspect .rescuerelay/dev.json.' }
}
function Test-Owner($state) {
    if (!$state -or $state.root -ne $repoRoot -or $state.token -notmatch '^[a-f0-9]{32}$') { return $false }
    $owner = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
    if (!$owner) { return $false }
    # Creation time rejects stale state even when Windows reuses a PID.
    if ($owner.StartTime.ToUniversalTime().Ticks.ToString() -ne $state.started) { return $false }
    $record = Get-CimInstance Win32_Process -Filter "ProcessId = $($owner.Id)"
    return ($record.CommandLine -and
        $record.CommandLine.IndexOf($helper, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
        $record.CommandLine -match ('-Token\s+' + [regex]::Escape($state.token) + '(\s|$)') -and
        $record.CommandLine -match '-Action\s+run(\s|$)')
}
function Write-State($value) {
    $temporary = Join-Path $runtime ('state-' + $value.token + '.tmp')
    [IO.File]::WriteAllText($temporary, ($value | ConvertTo-Json), $utf8)
    Move-Item -LiteralPath $temporary -Destination $stateFile -Force
}
function Assert-Prerequisites {
    if (!(Test-Path -LiteralPath (Join-Path $repoRoot 'package.json'))) { throw 'Keep the launcher inside the RescueRelay checkout.' }
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (!$node -or !$npm) { throw 'Install Node.js 24.x with npm 11+ from nodejs.org, then open a new terminal. Node/npm must be on PATH.' }
    $nodeVersion = & $node.Source --version
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v24\.') { throw "Node.js 24.x is required; found $nodeVersion." }
    $npmVersion = & $npm.Source --version
    if ($LASTEXITCODE -ne 0 -or [int]($npmVersion.Split('.')[0]) -lt 11) { throw "npm 11+ is required; found $npmVersion." }
    foreach ($entry in @('node_modules/.bin/concurrently.cmd','node_modules/.bin/tsx.cmd','node_modules/.bin/vite.cmd')) {
        if (!(Test-Path -LiteralPath (Join-Path $repoRoot $entry))) {
            throw 'Dependencies are missing. Open a terminal in this checkout and run npm ci, then start.bat.'
        }
    }
    return $npm.Source
}
function Assert-PortsFree {
    $busy = @([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
        Where-Object { $_.Port -in @(4000,5173) })
    if ($busy.Count) {
        throw "Port $((@($busy | ForEach-Object Port | Sort-Object -Unique)) -join ', ') is occupied. No process was stopped. Stop an earlier manual RescueRelay session with Ctrl+C, or resolve the conflict yourself."
    }
}
function Stop-Relay {
    $state = Read-State
    if (!(Test-Owner $state)) {
        if ($state) { Remove-Item -LiteralPath $stateFile -Force }
        Write-Host 'No launcher-owned RescueRelay session is running for this checkout. Other processes were left alone.'
        return
    }
    $request = Join-Path $runtime ('stop-' + $state.token)
    [IO.File]::WriteAllText($request, $state.token, $utf8)
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    do {
        Start-Sleep -Milliseconds 250
        $current = Read-State
        if (!$current -or $current.token -ne $state.token -or !(Test-Owner $current)) {
            Write-Host 'RescueRelay stopped. Only this launcher session was targeted.'
            return
        }
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'The supervisor did not acknowledge stop. No unrelated process was killed. Use Ctrl+C in its RescueRelay window and retry.'
}
function Start-Relay {
    $state = Read-State
    if (Test-Owner $state) {
        Write-Host "RescueRelay is already $($state.status) for this checkout (supervisor $($state.pid))."
        Write-Host 'Web: http://127.0.0.1:5173'
        return
    }
    if ($state) { Remove-Item -LiteralPath $stateFile -Force }
    $null = Assert-Prerequisites
    Assert-PortsFree
    $launchToken = [Guid]::NewGuid().ToString('N')
    $arguments = '-NoLogo -NoProfile -File "' + $helper + '" -Action run -Token ' + $launchToken
    # A separate visible console survives the initiating batch file/terminal.
    $runner = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $arguments -WorkingDirectory $repoRoot -WindowStyle Normal -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    do {
        Start-Sleep -Milliseconds 500
        $current = Read-State
        if ($current -and $current.token -eq $launchToken -and $current.status -eq 'running' -and (Test-Owner $current)) {
            Write-Host 'RescueRelay is ready: http://127.0.0.1:5173'
            Write-Host "API: http://127.0.0.1:4000/api/health | supervisor $($current.pid)"
            Write-Host 'Use stop.bat, restart.bat, or Ctrl+C in the RescueRelay window.'
            return
        }
        if ($runner.HasExited) { throw 'Startup failed. See .rescuerelay/dev.log for details.' }
    } while ([DateTime]::UtcNow -lt $deadline)
    # Cancel this exact request, even if initialization has not written its state yet.
    [IO.File]::WriteAllText((Join-Path $runtime ('stop-' + $launchToken)), $launchToken, $utf8)
    throw 'Startup timed out and cancellation was requested. Inspect .rescuerelay/dev.log; do not assume the app is ready.'
}
function Run-Relay {
    if ($Token -notmatch '^[a-f0-9]{32}$') { throw 'The supervisor requires a launcher-generated token.' }
    $Host.UI.RawUI.WindowTitle = 'RescueRelay - local development'
    Set-Location -LiteralPath $repoRoot
    Start-Transcript -Path (Join-Path $runtime 'dev.log') -Force | Out-Null
    $npmPath = Assert-Prerequisites
    Assert-PortsFree
    $env:HOST = '127.0.0.1'
    $env:PORT = '4000'
    $env:AI_EXTERNAL_CALLS_ENABLED = 'false'
    Add-Type -Path (Join-Path $PSScriptRoot 'dev-job.cs')
    $state = [pscustomobject]@{
        root=$repoRoot; token=$Token; pid=$PID
        started=(Get-Process -Id $PID).StartTime.ToUniversalTime().Ticks.ToString()
        status='starting'
    }
    Write-State $state
    $stopRequest = Join-Path $runtime ('stop-' + $Token)
    Write-Host "> npm run dev  (checkout: $repoRoot)"
    Write-Host 'Local-only demo. Stop with stop.bat or Ctrl+C. Logs: .rescuerelay/dev.log'
    $command = '"' + $env:ComSpec + '" /d /s /c ""' + (Join-Path $PSScriptRoot 'dev-command.bat') + '""'
    $script:job = New-Object RescueRelayJob($env:ComSpec, $command, $env:SystemRoot)
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    while (!$script:job.HasExited -and !(Test-Path -LiteralPath $stopRequest)) {
        if ($state.status -eq 'starting') {
            try {
                $health = Invoke-RestMethod 'http://127.0.0.1:4000/api/health' -TimeoutSec 1
                $web = Invoke-WebRequest 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 1
                if ($health.status -eq 'ok' -and $web.StatusCode -eq 200 -and $web.Content -match 'RescueRelay') {
                    $state.status = 'running'
                    Write-State $state
                    Write-Host 'Ready: http://127.0.0.1:5173'
                }
            } catch { }
            if ($state.status -ne 'running' -and [DateTime]::UtcNow -gt $deadline) { throw 'API/web did not become ready within 45 seconds.' }
        }
        Start-Sleep -Milliseconds 400
    }
    if ($script:job.HasExited -and !(Test-Path -LiteralPath $stopRequest)) {
        throw "npm run dev exited (code $($script:job.ExitCode)). Review the console output."
    }
}

try {
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null
    if ($Action -eq 'run') { Run-Relay }
    else {
        $hash = [Security.Cryptography.SHA256]::Create()
        try { $rootHash = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($repoRoot.ToLowerInvariant()))).Replace('-','') }
        finally { $hash.Dispose() }
        $mutex = New-Object Threading.Mutex($false, ('Local\RescueRelay-' + $rootHash))
        try { $locked = $mutex.WaitOne(65000) } catch [Threading.AbandonedMutexException] { $locked = $true }
        if (!$locked) { throw 'Another launcher operation is still in progress. Try again shortly.' }
        if ($Action -in @('stop','restart')) { Stop-Relay }
        if ($Action -in @('start','restart')) { Start-Relay }
    }
} catch {
    Write-Host ("RescueRelay: " + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    if ($Action -eq 'run') {
        if ($script:job) { $script:job.Stop() }
        $state = Read-State
        if ($state -and $state.token -eq $Token) { Remove-Item -LiteralPath $stateFile -Force }
        if ($Token -match '^[a-f0-9]{32}$') {
            $request = Join-Path $runtime ('stop-' + $Token)
            if (Test-Path -LiteralPath $request) { Remove-Item -LiteralPath $request -Force }
        }
        try { Stop-Transcript | Out-Null } catch { }
    }
    if ($locked) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
}
