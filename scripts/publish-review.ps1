[CmdletBinding()]
param([switch]$Prepared, [switch]$ResumeStaged, [switch]$SyncGitOnly)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$team = 'scoutgaming'
$teamId = 'team_Scxorb9qtZHjNae1YEQnFCaT'
$project = 'scout-dealerlab'
$projectId = 'prj_mQwHzspK3GrrJA04eFOorFxth0d5'
$publicUrl = 'https://scout-dealerlab.vercel.app'

Push-Location -LiteralPath $root
try {
    $package = Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json
    $nodeVersion = (& node -p 'process.versions.node').Trim()
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -ne $package.volta.node) { throw 'Use the Node version pinned in package.json, resolved from this project.' }
    $targetPath = Join-Path $root 'references/public-review.json'
    $target = Get-Content -LiteralPath $targetPath -Raw | ConvertFrom-Json
    if ($target.projectId -ne $projectId -or $target.teamId -ne $teamId -or $target.projectName -ne $project -or $target.teamSlug -ne $team) { throw 'The public review target does not match the dedicated review project.' }
    if ($SyncGitOnly) {
        & node scripts/sync-public-repo.ts
        if ($LASTEXITCODE -ne 0) { throw 'Public Git synchronization failed. No deployment was attempted.' }
        Write-Host 'Current review receipt and public source synchronized to GitHub.'
        return
    }
    if (-not $Prepared -and -not $ResumeStaged) {
        & node scripts/build-review-hub.ts
        if ($LASTEXITCODE -ne 0) { throw 'Public review export failed. Nothing was uploaded.' }
    }
    $receiptPath = Join-Path $root '.runtime/public-review-ready.json'
    $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    $expectedStatus = if ($ResumeStaged) { 'staged-awaiting-verification' } else { 'prepared-not-uploaded' }
    if ($receipt.uploaded -or $receipt.status -ne $expectedStatus) { throw 'Use a new prepared snapshot, or explicitly resume the recorded staged deployment.' }
    if ($receipt.baselineDeployment -ne $target.deploymentId) { throw 'Published baseline changed; prepare a fresh review snapshot.' }
    & node scripts/sync-public-repo.ts --pending-snapshot $receipt.id
    if ($LASTEXITCODE -ne 0) { throw 'Public source must be synchronized to GitHub before the review URL can change.' }
    $directory = [IO.Path]::GetFullPath($receipt.directory)
    $exportRoot = [IO.Path]::GetFullPath((Join-Path $root 'exports')) + [IO.Path]::DirectorySeparatorChar
    if (-not $directory.StartsWith($exportRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Export is outside this project.' }
    $link = Get-Content -LiteralPath (Join-Path $directory '.vercel/project.json') -Raw | ConvertFrom-Json
    if ($link.projectId -ne $projectId -or $link.orgId -ne $teamId) { throw 'Unexpected deployment link.' }
    Set-Location -LiteralPath $directory
    $ErrorActionPreference = 'Continue'
    & vercel project inspect --scope $team --non-interactive
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -ne 0) { throw 'Could not verify the dedicated review project from the export directory.' }
    Write-Host 'Publishing selected review copies to scoutgaming/scout-dealerlab. All visitors may read them.'
    $utf8 = New-Object Text.UTF8Encoding($false)
    if ($ResumeStaged) {
        $deployment = [pscustomobject]@{ id = $receipt.deploymentId; url = $receipt.deploymentUrl }
        if (-not $deployment.id.StartsWith('dpl_') -or ([uri]$deployment.url).Host -notlike 'scout-dealerlab-*.vercel.app') { throw 'Invalid recorded staged deployment.' }
    } else {
    $log = Join-Path $directory 'deployment.log'
    # Vercel writes progress on stderr. Capture it locally; inspect the exit code explicitly.
    $ErrorActionPreference = 'Continue'
    $output = & vercel deploy --prebuilt --prod --skip-domain --scope $team --non-interactive --yes --format json 2> $log
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    # Preserve structured errors and successful task IDs before parsing or throwing.
    # A retry must first establish whether the provider created a deployment.
    [IO.File]::WriteAllText((Join-Path $directory 'deployment-result.json'), ($output -join [Environment]::NewLine), $utf8)
    [IO.File]::WriteAllText((Join-Path $directory 'deployment-process.json'), (@{ exitCode = $exitCode; recordedAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json), $utf8)
    if ($exitCode -ne 0) { throw "Deployment failed. See $log. Do not blindly retry: verify whether a deployment was created." }
    $deployment = (($output -join [Environment]::NewLine) | ConvertFrom-Json).deployment
    if ($deployment.readyState -ne 'READY') { throw 'Deployment did not report READY.' }
    $receipt | Add-Member -Force NoteProperty deploymentId $deployment.id
    $receipt | Add-Member -Force NoteProperty deploymentUrl $deployment.url
    $receipt | Add-Member -Force NoteProperty status 'staged-awaiting-verification'
    [IO.File]::WriteAllText($receiptPath, ($receipt | ConvertTo-Json -Depth 12), $utf8)
    [IO.File]::WriteAllText((Join-Path $directory 'receipt.json'), ($receipt | ConvertTo-Json -Depth 12), $utf8)
    }
    $ErrorActionPreference = 'Continue'
    # This CLI's curl wrapper forwards --scope to curl. Use the verified local
    # project link plus explicit process-scoped IDs for this command instead.
    $env:VERCEL_ORG_ID = $teamId
    $env:VERCEL_PROJECT_ID = $projectId
    $stagedJson = & vercel curl /latest.json --deployment $deployment.url 2> (Join-Path $directory 'staged-verification.log')
    $fetchExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($fetchExit -ne 0) { throw 'Staged review could not be fetched. Do not retry the deployment.' }
    $staged = ($stagedJson -join [Environment]::NewLine) | ConvertFrom-Json
    if ($staged.snapshot -ne $receipt.id -or $staged.contentId -ne $receipt.contentId) { throw 'Staged snapshot mismatch.' }
    $ErrorActionPreference = 'Continue'
    & vercel promote $deployment.url --scope $team --yes --non-interactive
    $promoteExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($promoteExit -ne 0) { throw 'Promotion failed. Inspect the staged deployment before retrying.' }
    $published = $null
    # Alias/CDN propagation can briefly return the predecessor after READY.
    # Retry only the read, never the deployment; a unique URL avoids a cached client response.
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        $manifest = Invoke-WebRequest -UseBasicParsing -Headers @{'Cache-Control'='no-cache'} -Uri ($publicUrl + '/manifest.json?verify=' + $receipt.id + '-' + $attempt)
        $published = $manifest.Content | ConvertFrom-Json
        if ($published.snapshot -eq $receipt.id) { break }
        if ($attempt -lt 2) { Start-Sleep -Seconds 2 }
    }
    if ($published.snapshot -ne $receipt.id) { throw 'The public alias does not show the new snapshot. Verify the alias before retrying.' }
    $verifiedAt = [DateTime]::UtcNow.ToString('o')
    $target | Add-Member -Force NoteProperty publicUrl $publicUrl
    $target | Add-Member -Force NoteProperty deploymentId $deployment.id
    $target | Add-Member -Force NoteProperty verifiedAt $verifiedAt
    $target | Add-Member -Force NoteProperty contentId $receipt.contentId
    $target | Add-Member -Force NoteProperty snapshot $receipt.id
    $target | Add-Member -Force NoteProperty currentExport ($directory.Substring($root.Length + 1).Replace('\','/'))
    $target | Add-Member -Force NoteProperty reviewUrl ($publicUrl + '/granskning.html')
    $receipt | Add-Member -Force NoteProperty uploaded $true
    $receipt | Add-Member -Force NoteProperty publicUrl $publicUrl
    $receipt | Add-Member -Force NoteProperty deploymentId $deployment.id
    $receipt | Add-Member -Force NoteProperty verifiedAt $verifiedAt
    $receipt | Add-Member -Force NoteProperty status 'published-and-verified'
    [IO.File]::WriteAllText($targetPath, ($target | ConvertTo-Json -Depth 10), $utf8)
    [IO.File]::WriteAllText($receiptPath, ($receipt | ConvertTo-Json -Depth 10), $utf8)
    [IO.File]::WriteAllText((Join-Path $directory 'receipt.json'), ($receipt | ConvertTo-Json -Depth 12), $utf8)
    Set-Location -LiteralPath $root
    & node scripts/sync-public-repo.ts
    if ($LASTEXITCODE -ne 0) { throw 'The review URL is published, but Git receipt synchronization failed. Retry only: scripts/publish-review.ps1 -SyncGitOnly' }
    $gitSync = Get-Content '.runtime/public-git-last-sync.json' -Raw | ConvertFrom-Json
    $receipt | Add-Member -Force NoteProperty publicGitCommit $gitSync.commit
    [IO.File]::WriteAllText($receiptPath, ($receipt | ConvertTo-Json -Depth 12), $utf8)
    [IO.File]::WriteAllText((Join-Path $directory 'receipt.json'), ($receipt | ConvertTo-Json -Depth 12), $utf8)
    Write-Host "Ready: $publicUrl"
    Write-Host "Snapshot: $($receipt.id). No local server was started."
}
finally { Pop-Location }
