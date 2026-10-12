<#
.SYNOPSIS
  One-shot setup: put the aces plugins' runtime state (boards + teammates) into a
  git repository and push it to a remote origin so state can be versioned,
  backed up, and rolled back.

.USAGE
  .\scripts\ace-state-init.ps1 <origin-url>

  .\scripts\ace-state-init.ps1 https://github.com/user/paseo-aces-state.git

.STATE DIR
  The git repo is created at:

    $env:PASEO_HOME\aces         if PASEO_HOME is set
    $env:USERPROFILE\.paseo\aces  otherwise

  Both the `aces-boards` plugin (boards.json) and the `aces-teammates` plugin
  (teammates.json + teammates/<slug>/ dirs) live under this directory.

.RECURRING COMMANDS
  Run these from inside the state dir (cd $env:USERPROFILE\.paseo\aces):

    git add -A; git commit -m "aces state snapshot"   # commit the current state
    git push                                         # push commits to origin
    git pull --rebase                                # pull remote changes
    git log --oneline                                # inspect history
    git checkout <sha> -- .                          # restore files to a snapshot
#>

param(
  [Parameter(Position = 0)]
  [string]$OriginUrl
)

if (-not $OriginUrl) {
  Write-Host "Usage: .\scripts\ace-state-init.ps1 <origin-url>"
  Write-Host "Example: .\scripts\ace-state-init.ps1 https://github.com/user/paseo-aces-state.git"
  exit 1
}

if ($OriginUrl -match "\s") {
  Write-Host "Error: the origin URL must not contain spaces." -ForegroundColor Red
  exit 1
}

if ($OriginUrl -notmatch "(://|@|:)") {
  Write-Host "Error: '$OriginUrl' does not look like a git remote URL." -ForegroundColor Red
  Write-Host "  Expected https://github.com/user/repo.git or git@github.com:user/repo.git"
  exit 1
}

$base = if ($env:PASEO_HOME) { $env:PASEO_HOME } else { Join-Path $env:USERPROFILE ".paseo" }
$stateDir = Join-Path $base "aces"

if (-not (Test-Path -LiteralPath $stateDir)) {
  New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
}

Push-Location $stateDir
try {
  if (-not (Test-Path -LiteralPath (Join-Path $stateDir ".git"))) {
    git init
  }

  $userName = git config user.name
  if (-not $userName) {
    git config --local user.name "paseo-aces"
  }
  $userEmail = git config user.email
  if (-not $userEmail) {
    git config --local user.email "paseo-aces@localhost"
  }
  git config --local commit.gpgsign false

  # Ephemeral presence state (which teammates are running) must never be
  # committed to the state repo.
  $gitignorePath = Join-Path $stateDir ".gitignore"
  $ignoreLine = "active.json"
  if (Test-Path -LiteralPath $gitignorePath) {
    $existing = Get-Content -LiteralPath $gitignorePath -Raw
    if ($existing -notmatch [regex]::Escape($ignoreLine)) {
      Add-Content -LiteralPath $gitignorePath -Value "`n$ignoreLine"
    }
  }
  else {
    Set-Content -LiteralPath $gitignorePath -Value "$ignoreLine`n"
  }

  git add -A
  git commit -m "aces state snapshot" --no-gpg-sign
  if ($LASTEXITCODE -ne 0) {
    Write-Host "No changes to commit; state dir may be empty. Re-run once state exists."
    exit 0
  }

  $remote = git remote
  if (-not $remote) {
    git remote add origin $OriginUrl
  }

  git branch -M main
  git push -u origin main
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: git push failed. Check the URL and your credentials." -ForegroundColor Red
    exit 1
  }
  Write-Host "Pushed state to $OriginUrl."
}
finally {
  Pop-Location
}
