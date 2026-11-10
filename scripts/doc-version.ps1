[CmdletBinding(DefaultParameterSetName = 'Update')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Initialize')][switch]$InitializeAll,
    [Parameter(Mandatory, ParameterSetName = 'InitializeOne')][string]$InitializePath,
    [Parameter(Mandatory, ParameterSetName = 'Update')][string]$Path,
    [Parameter(Mandatory, ParameterSetName = 'Update')][string]$CandidatePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$historyRoot = Join-Path $workspace '.history/markdown'

function Assert-SafePath([string]$FullPath) {
    $full = [IO.Path]::GetFullPath($FullPath)
    if ($full -ne $workspace -and -not $full.StartsWith($workspace + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path outside workspace: $full"
    }
    # Check every existing ancestor, including ancestors above the workspace.
    $cursor = $full
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse point is not allowed: $cursor" }
        }
        $parent = [IO.Path]::GetDirectoryName($cursor)
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
    return $full
}

function Get-Hash([byte[]]$Bytes) {
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hasher.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $hasher.Dispose() }
}

function Read-SafeBytes([string]$FullPath) {
    $safe = Assert-SafePath $FullPath
    if (-not (Test-Path -LiteralPath $safe -PathType Leaf)) { throw "File not found: $safe" }
    return ,([IO.File]::ReadAllBytes($safe))
}

function Get-Document([string]$RelativePath) {
    if ([IO.Path]::IsPathRooted($RelativePath) -or $RelativePath.Contains(':')) { throw 'Document path must be relative.' }
    $relative = $RelativePath.Replace('\', '/')
    if ($relative -cnotmatch '^(README\.md|AGENTS\.md|docs/(?:[^/\\:]+/)*[^/\\:]+\.md)$' -or $relative -match '(^|/)\.' -or
        @($relative.Split('/') | Where-Object { $_.EndsWith(' ') -or $_.EndsWith('.') -or $_.IndexOfAny([IO.Path]::GetInvalidFileNameChars()) -ge 0 }).Count -gt 0) {
        throw 'Only README.md, AGENTS.md and Markdown under docs/ are versioned; hidden or ambiguous path segments are not allowed.'
    }
    $full = Assert-SafePath (Join-Path $workspace $relative)
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw "Document not found: $relative" }
    return [pscustomobject]@{ Relative = $relative; Full = $full; History = (Assert-SafePath (Join-Path $historyRoot $relative.Substring(0, $relative.Length - 3))) }
}

function Get-DocsBelow([string]$Directory) {
    $safe = Assert-SafePath $Directory
    foreach ($item in Get-ChildItem -LiteralPath $safe -Force | Sort-Object Name) {
        Assert-SafePath $item.FullName | Out-Null
        if ($item.PSIsContainer) { Get-DocsBelow $item.FullName }
        elseif ($item.Extension -ceq '.md') {
            Get-Document ($item.FullName.Substring($workspace.Length + 1).Replace('\', '/'))
        }
    }
}

function Write-NewBytes([string]$FullPath, [byte[]]$Bytes) {
    $safe = Assert-SafePath $FullPath
    $stream = [IO.File]::Open($safe, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($Bytes, 0, $Bytes.Length); $stream.Flush($true) }
    finally { $stream.Dispose() }
}

function Write-State($Document, $State, [bool]$Replace) {
    $target = Assert-SafePath (Join-Path $Document.History 'state.json')
    $temp = Join-Path $Document.History ('.state-' + [guid]::NewGuid().ToString('N') + '.tmp')
    try {
        Write-NewBytes $temp ([Text.UTF8Encoding]::new($false).GetBytes(($State | ConvertTo-Json -Depth 6) + "`n"))
        if ($Replace) { [IO.File]::Replace($temp, $target, [NullString]::Value) }
        else { [IO.File]::Move($temp, $target) }
    } finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath (Assert-SafePath $temp) } }
}

function Get-CheckedState($Document) {
    $stateFile = Join-Path $Document.History 'state.json'
    $baselineFile = Join-Path $Document.History 'baseline.md'
    if (-not (Test-Path -LiteralPath $stateFile)) {
        if (Test-Path -LiteralPath $Document.History) { throw "History exists without state; inspect before continuing: $($Document.Relative)" }
        $bytes = Read-SafeBytes $Document.Full
        $hash = Get-Hash $bytes
        [IO.Directory]::CreateDirectory((Assert-SafePath $Document.History)) | Out-Null
        Write-NewBytes $baselineFile $bytes
        if ((Get-Hash (Read-SafeBytes $Document.Full)) -ne $hash) { throw "Document changed during baseline capture: $($Document.Relative)" }
        $state = [pscustomobject]@{
            schemaVersion = 1; document = $Document.Relative; baselineVersion = 1; baselineSha256 = $hash
            currentVersion = 1; currentSha256 = $hash; previousVersions = @()
            initializedUtc = [DateTime]::UtcNow.ToString('o'); updatedUtc = [DateTime]::UtcNow.ToString('o')
        }
        Write-State $Document $state $false
    }
    $state = [Text.Encoding]::UTF8.GetString((Read-SafeBytes $stateFile)) | ConvertFrom-Json
    if ($state.schemaVersion -ne 1 -or $state.document -cne $Document.Relative -or $state.baselineVersion -ne 1 -or
        $state.currentVersion -isnot [long] -and $state.currentVersion -isnot [int]) { throw 'Invalid history state.' }
    if ($state.currentVersion -lt 1 -or $state.currentVersion -gt 9999 -or $state.currentSha256 -cnotmatch '^[0-9a-f]{64}$') { throw 'Invalid current version/hash.' }
    if ((Get-Hash (Read-SafeBytes $baselineFile)) -ne $state.baselineSha256) { throw 'Baseline hash mismatch.' }
    $previous = @($state.previousVersions)
    $expected = @()
    if ($state.currentVersion -gt 1) { $expected = @([Math]::Max(1, $state.currentVersion - 2)..($state.currentVersion - 1)) }
    if ($previous.Count -ne $expected.Count) { throw 'Invalid retained version count.' }
    for ($i = 0; $i -lt $previous.Count; $i++) {
        $record = $previous[$i]
        if ($record.version -ne $expected[$i] -or $record.sha256 -cnotmatch '^[0-9a-f]{64}$') { throw 'Invalid retained version record.' }
        $file = if ($record.version -eq 1) { $baselineFile } else { Join-Path $Document.History ('v{0:D4}.md' -f [int]$record.version) }
        if ((Get-Hash (Read-SafeBytes $file)) -ne $record.sha256) { throw "Retained version hash mismatch: $file" }
    }
    $ownedSnapshots = @($previous | Where-Object { $_.version -gt 1 } | ForEach-Object { 'v{0:D4}.md' -f [int]$_.version })
    foreach ($file in Get-ChildItem -LiteralPath $Document.History -File) {
        if ($file.Name -match '^v\d+\.md$' -and $file.Name -cnotin $ownedSnapshots) {
            throw "Unrecorded historical version; preserve and inspect it: $($file.FullName)"
        }
    }
    if ((Get-Hash (Read-SafeBytes $Document.Full)) -ne $state.currentSha256) {
        throw "Document changed outside doc-version; preserve and reconcile it before continuing: $($Document.Relative)"
    }
    return $state
}

Assert-SafePath $workspace | Out-Null
Assert-SafePath $historyRoot | Out-Null
if ($InitializeAll) {
    $documents = @((Get-Document 'README.md'), (Get-Document 'AGENTS.md'))
    Assert-SafePath (Join-Path $workspace 'docs') | Out-Null
    $documents += @(Get-DocsBelow (Join-Path $workspace 'docs'))
} elseif ($InitializePath) {
    $documents = @((Get-Document $InitializePath))
} else {
    $documents = @((Get-Document $Path))
    $candidate = Assert-SafePath $(if ([IO.Path]::IsPathRooted($CandidatePath)) { $CandidatePath } else { Join-Path $workspace $CandidatePath })
    $relativeCandidate = $candidate.Substring($workspace.Length + 1).Replace('\', '/')
    if ([IO.Path]::GetExtension($candidate) -ne '.md' -or $relativeCandidate -match '^(gpt-underlag|extra|private|node_modules|\.git|\.history)(/|$)' -or $candidate -eq $documents[0].Full) {
        throw 'Candidate must be a separate local Markdown file outside protected source/history directories.'
    }
    $candidateBytes = Read-SafeBytes $candidate
    $candidateHash = Get-Hash $candidateBytes
}
[IO.Directory]::CreateDirectory($historyRoot) | Out-Null
$lockPath = Assert-SafePath (Join-Path $historyRoot '.lock')
$lock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
try {
    foreach ($document in $documents) {
        $state = Get-CheckedState $document
        if ($InitializeAll -or $InitializePath) { Write-Output "$($document.Relative): baseline v0001; current v$('{0:D4}' -f $state.currentVersion) verified"; continue }
        if ($candidateHash -eq $state.currentSha256) { Write-Output "$($document.Relative): unchanged; v$('{0:D4}' -f $state.currentVersion)"; continue }
        if ($state.currentVersion -ge 9999) { throw 'Version limit reached (9999).' }
        $currentBytes = Read-SafeBytes $document.Full
        if ((Get-Hash $currentBytes) -ne $state.currentSha256) { throw 'Document changed before snapshot.' }
        $previous = @($state.previousVersions) + @([pscustomobject]@{ version = $state.currentVersion; sha256 = $state.currentSha256 })
        $retained = @($previous | Select-Object -Last 2)
        $removed = @($previous | Select-Object -First ([Math]::Max(0, $previous.Count - 2)))
        $snapshot = Join-Path $document.History ('v{0:D4}.md' -f [int]$state.currentVersion)
        if ($state.currentVersion -gt 1) {
            if (Test-Path -LiteralPath $snapshot) { throw "Unexpected snapshot already exists: $snapshot" }
            Write-NewBytes $snapshot $currentBytes
        }
        $temporaryDocument = Join-Path ([IO.Path]::GetDirectoryName($document.Full)) ('.doc-version-' + [guid]::NewGuid().ToString('N') + '.tmp')
        try {
            Write-NewBytes $temporaryDocument $candidateBytes
            if ((Get-Hash (Read-SafeBytes $document.Full)) -ne $state.currentSha256) { throw 'Concurrent document edit detected; candidate was not installed.' }
            Assert-SafePath $document.Full | Out-Null
            [IO.File]::Replace($temporaryDocument, $document.Full, [NullString]::Value)
            $state.currentVersion = [int]$state.currentVersion + 1
            $state.currentSha256 = $candidateHash
            $state.previousVersions = $retained
            $state.updatedUtc = [DateTime]::UtcNow.ToString('o')
            Write-State $document $state $true
            foreach ($old in $removed) {
                if ($old.version -eq 1) { continue }
                $oldFile = Join-Path $document.History ('v{0:D4}.md' -f [int]$old.version)
                if ((Get-Hash (Read-SafeBytes $oldFile)) -ne $old.sha256) { throw 'Refusing to remove changed historical file.' }
                Remove-Item -LiteralPath (Assert-SafePath $oldFile)
            }
            Write-Output "$($document.Relative): installed v$('{0:D4}' -f $state.currentVersion); baseline and two latest predecessors retained"
        } finally { if (Test-Path -LiteralPath $temporaryDocument) { Remove-Item -LiteralPath (Assert-SafePath $temporaryDocument) } }
    }
} finally { $lock.Dispose() }
