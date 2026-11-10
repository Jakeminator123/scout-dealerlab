param([Parameter(Mandatory)][string]$Directory, [Parameter(Mandatory)][string]$Archive, [switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$exports = [IO.Path]::GetFullPath((Join-Path $workspace 'exports'))
$source = [IO.Path]::GetFullPath($Directory)
$target = [IO.Path]::GetFullPath($Archive)
foreach ($candidate in @($source, $target)) {
    if (-not $candidate.StartsWith($exports + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Export path outside workspace exports' }
    $cursor = $candidate
    while ($cursor) {
        if ((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Linked export paths are not allowed' }
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
}
function Get-Sha256([string]$File) {
    $inputStream = [IO.File]::OpenRead($File)
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hash.ComputeHash($inputStream))).Replace('-', '') }
    finally { $inputStream.Dispose(); $hash.Dispose() }
}
if ((Test-Path -LiteralPath $target) -and -not $VerifyOnly) { throw 'Archive already exists; refusing to overwrite' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (-not $VerifyOnly) { [IO.Compression.ZipFile]::CreateFromDirectory($source, $target, [IO.Compression.CompressionLevel]::Optimal, $false) }
$archiveFile = [IO.Compression.ZipFile]::OpenRead($target)
$verified = 0
try {
    foreach ($entry in $archiveFile.Entries) {
        if ($entry.FullName.EndsWith('/')) { continue }
        $file = [IO.Path]::GetFullPath((Join-Path $source $entry.FullName))
        if (-not $file.StartsWith($source + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe archive member' }
        $stream = $entry.Open()
        $hasher = [Security.Cryptography.SHA256]::Create()
        try { $packedHash = ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '') }
        finally { $stream.Dispose(); $hasher.Dispose() }
        if ($packedHash -ne (Get-Sha256 $file)) { throw "Archive verification failed: $($entry.FullName)" }
        $verified++
    }
} finally { $archiveFile.Dispose() }
$diskFiles = [IO.Directory]::GetFiles($source, '*', [IO.SearchOption]::AllDirectories).Length
if ($verified -ne $diskFiles) { throw 'Archive member count does not match package' }
[pscustomobject]@{ archive = $target; filesVerified = $verified; bytes = (Get-Item -LiteralPath $target).Length; sha256 = (Get-Sha256 $target).ToLowerInvariant() } | ConvertTo-Json -Compress
