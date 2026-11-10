$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('dealerlab-publish-test-' + [guid]::NewGuid().ToString('N'))
$original = (Get-Location).Path
New-Item -ItemType Directory -Path "$fixture/scripts","$fixture/references","$fixture/.runtime","$fixture/exports/test/.vercel" -Force | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'publish-review.ps1') "$fixture/scripts/publish-review.ps1"
$project='prj_mQwHzspK3GrrJA04eFOorFxth0d5';$team='team_Scxorb9qtZHjNae1YEQnFCaT'
@{volta=@{node='24.21.0'}}|ConvertTo-Json|Set-Content "$fixture/package.json"
@{projectId=$project;orgId=$team}|ConvertTo-Json|Set-Content "$fixture/exports/test/.vercel/project.json"
function node {
    if ($args[0] -eq '-p') { $global:LASTEXITCODE=0; return '24.21.0' }
    $pending=$args -contains '--pending-snapshot'
    $global:dealerlabGitTestEvents.Add($(if($pending){'git-before'}else{'git-after'}))
    $global:LASTEXITCODE=if(($pending -and $global:dealerlabGitTestScenario -eq 'before-fails') -or (-not $pending -and $global:dealerlabGitTestScenario -eq 'after-fails')){1}else{0}
    if($global:LASTEXITCODE -eq 0){@{commit='test-public-commit'}|ConvertTo-Json|Set-Content "$fixture/.runtime/public-git-last-sync.json"}
}
function vercel {
    $global:LASTEXITCODE=0
    switch($args[0]) {
        'project' { $global:dealerlabGitTestEvents.Add('inspect') }
        'deploy' { $global:dealerlabGitTestEvents.Add('deploy'); return '{"deployment":{"id":"dpl_test","url":"https://scout-dealerlab-test.vercel.app","readyState":"READY"}}' }
        'curl' { return '{"snapshot":"test-snapshot","contentId":"test-content"}' }
        'promote' { $global:dealerlabGitTestEvents.Add('promote') }
        default { throw 'Unexpected Vercel operation' }
    }
}
function Invoke-WebRequest { @{Content='{"snapshot":"test-snapshot"}'} }
function check([bool]$condition,[string]$message){if(-not $condition){throw $message}}
try {
    foreach($scenario in @('before-fails','after-fails','success')){
        $global:dealerlabGitTestScenario=$scenario;$global:dealerlabGitTestEvents=[Collections.Generic.List[string]]::new()
        @{projectId=$project;teamId=$team;projectName='scout-dealerlab';teamSlug='scoutgaming';deploymentId='dpl_old'}|ConvertTo-Json|Set-Content "$fixture/references/public-review.json"
        @{id='test-snapshot';contentId='test-content';status='prepared-not-uploaded';uploaded=$false;baselineDeployment='dpl_old';directory="$fixture/exports/test"}|ConvertTo-Json|Set-Content "$fixture/.runtime/public-review-ready.json"
        $failure='';try{& "$fixture/scripts/publish-review.ps1" -Prepared *> $null}catch{$failure=$_.Exception.Message}
        if($scenario -eq 'before-fails'){
            check ($failure -match 'before the review URL can change') ("Missing fail-before-publish guard: " + $failure)
            check ($global:dealerlabGitTestEvents.Count -eq 1 -and $global:dealerlabGitTestEvents[0] -eq 'git-before') 'Vercel called after Git failure'
        }else{
            check (($global:dealerlabGitTestEvents -join ',') -eq 'git-before,inspect,deploy,promote,git-after') 'Wrong publication order'
            $target=Get-Content "$fixture/references/public-review.json" -Raw|ConvertFrom-Json
            check ($target.deploymentId -eq 'dpl_test') 'Published receipt was not retained'
            if($scenario -eq 'after-fails'){check ($failure -match 'SyncGitOnly') 'Missing recovery instruction'}
            else{check (-not $failure) $failure;$receipt=Get-Content "$fixture/.runtime/public-review-ready.json" -Raw|ConvertFrom-Json;check ($receipt.publicGitCommit -eq 'test-public-commit') 'Git receipt missing'}
        }
        Write-Output "PASS $scenario"
    }
} finally {
    Set-Location -LiteralPath $original
    $resolved=[IO.Path]::GetFullPath($fixture)
    if($resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath())) -and (Split-Path $resolved -Leaf).StartsWith('dealerlab-publish-test-')){Remove-Item -LiteralPath $resolved -Recurse -Force}
}
