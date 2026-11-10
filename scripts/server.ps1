param([ValidateSet('start','stop','status')][string]$Action = 'status')
$ErrorActionPreference = 'Stop'
$labRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
Set-Location -LiteralPath $labRoot
$runtimeDir = Join-Path $labRoot '.runtime'
$stateFile = Join-Path $runtimeDir 'server.json'
$labUrl = 'http://127.0.0.1:4318'

function Test-LabPortFree {
    # Test an exclusive bind; Windows connection-state metadata can be unavailable.
    $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 4318)
    $probe.Server.ExclusiveAddressUse = $true
    try { $probe.Start(); return $true }
    catch [Net.Sockets.SocketException] { return $false }
    finally { $probe.Stop() }
}

function Get-LabState {
    if (-not (Test-Path -LiteralPath $stateFile)) { return $null }
    $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    if ($state.root -ne $labRoot -or $state.app -ne 'snyggare-dealer' -or $state.port -ne 4318) { throw 'Serverfilen tillhor inte denna arbetsyta.' }
    return $state
}
function Test-LabIdentity($state) {
    if (-not $state) { return $false }
    $proc = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$state.pid)
    if (-not $proc) { return $false }
    $expectedScript = Join-Path $labRoot 'src\server.ts'
    $created = $proc.CreationDate.ToUniversalTime()
    $boot = [DateTimeOffset]::Parse($state.startedAt).UtcDateTime
    if ($proc.ExecutablePath -ne $state.executable -or $state.script -ne $expectedScript -or $proc.CommandLine -notlike ('*"' + $expectedScript + '"*') -or [int]$proc.ParentProcessId -ne [int]$state.parentPid -or [Math]::Abs(($boot - $created).TotalSeconds) -gt 30) {
        throw 'PID-identiteten kan inte verifieras. Ingen process paverkas.'
    }
    try { $health = Invoke-RestMethod -Uri ($labUrl + '/api/health') -TimeoutSec 2 } catch { throw 'Processen finns men serveridentiteten kan inte verifieras. Ingen process paverkas.' }
    if ($health.instanceId -ne $state.instanceId -or $health.pid -ne $state.pid -or $health.root -ne $labRoot) { throw 'Servern svarar med en annan identitet. Ingen process paverkas.' }
    return $true
}

try {
    $state = Get-LabState
    if ($Action -eq 'status') {
        if (Test-LabIdentity $state) { Write-Host ('KOR: ' + $labUrl + ' | PID ' + $state.pid + ' | start ' + $state.startedAt) }
        else { Write-Host 'STOPPAD: ingen verifierad dealerlab-server.' }
        exit 0
    }
    if ($Action -eq 'stop') {
        if (-not (Test-LabIdentity $state)) { Write-Host 'Redan stoppad. Ingen process paverkades.'; exit 0 }
        Invoke-RestMethod -Method Post -Uri ($labUrl + '/api/shutdown') -Headers @{ 'X-Dealer-Control' = $state.shutdownToken } -TimeoutSec 5 | Out-Null
        $deadline = [DateTime]::UtcNow.AddSeconds(20)
        do {
            $remaining = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$state.pid)
            if (-not $remaining) { break }
            Start-Sleep -Milliseconds 200
        } while ([DateTime]::UtcNow -lt $deadline)
        if ($remaining) { throw 'Avstangning begard men processen finns kvar. Ingen tvangsavstangning gjordes.' }
        if (-not (Test-LabPortFree)) { throw 'Egen process avslutad men porten ar upptagen; annan agare kan ha tagit porten.' }
        Write-Host 'STOPPAD: processen avslutad och port 4318 fri.'
        exit 0
    }
    if (Test-LabIdentity $state) { Write-Host ('Ateranvander: ' + $labUrl); exit 0 }
    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
    if ((Get-Item -LiteralPath $runtimeDir).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Runtime-mappen far inte vara en lank.' }
    # Exclusive startup lock prevents two launcher invocations racing on the same state/logs.
    $lock = [IO.File]::Open((Join-Path $runtimeDir 'start.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    try {
        $state = Get-LabState
        if (Test-LabIdentity $state) { Write-Host ('Ateranvander: ' + $labUrl); exit 0 }
        if (-not (Test-LabPortFree)) { throw 'Port 4318 anvands. Ingen befintlig process stoppades.' }
        $package = Get-Content -LiteralPath (Join-Path $labRoot 'package.json') -Raw | ConvertFrom-Json
        if ($package.engines.node -ne '>=24.21.0 <25' -or $package.volta.node -ne '24.21.0') { throw 'Node-kraven har andrats; uppdatera startskriptets kontroll.' }
        $nodeExecutable = (& volta which node | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $nodeExecutable)) { throw 'Volta kunde inte valja Node. Installera den pinnade versionen separat.' }
        $nodeVersion = (& $nodeExecutable -p 'process.version' | Out-String).Trim()
        if ($nodeVersion -ne ('v' + $package.volta.node)) { throw ('Fel Node-version: ' + $nodeVersion) }
        $script = Join-Path $labRoot 'src\server.ts'
        $launched = Start-Process -FilePath $nodeExecutable -ArgumentList ('"' + $script + '"') -WorkingDirectory $labRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'server.out.log') -RedirectStandardError (Join-Path $runtimeDir 'server.err.log')
        $deadline = [DateTime]::UtcNow.AddSeconds(45)
        do {
            Start-Sleep -Milliseconds 200
            $launched.Refresh()
            if ($launched.HasExited) { throw 'Servern avslutades. Se .runtime/server.err.log.' }
            $newState = Get-LabState
            if ($newState -and $newState.pid -eq $launched.Id) {
                if (Test-LabIdentity $newState) { Write-Host ('STARTAD: ' + $labUrl + ' | Node ' + $nodeVersion + ' | PID ' + $newState.pid); exit 0 }
            }
        } while ([DateTime]::UtcNow -lt $deadline)
        throw 'Starten kunde inte verifieras inom 45 sekunder. Se .runtime/server.err.log.'
    } finally { if ($lock) { $lock.Dispose() } }
} catch { Write-Host ('FEL: ' + $_.Exception.Message) -ForegroundColor Red; exit 1 }
