param(
  [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
  [string[]]$PnpmArguments
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($env:OS -ne "Windows_NT") {
  throw "This script must run in PowerShell on Windows."
}

if (-not (Test-Path "package.json")) {
  throw "Run this script from the VCG-Console repository root."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Missing prerequisite: node. Install Node.js 22 or newer, open a new terminal, then rerun."
}

$packageManager = (Get-Content "package.json" -Raw | ConvertFrom-Json).packageManager
if ($packageManager -notmatch '^pnpm@(.+)$') {
  throw "package.json must pin pnpm with a packageManager value such as pnpm@10.30.3."
}
$expectedPnpmVersion = $Matches[1]
$hasCorepack = [bool](Get-Command corepack -ErrorAction SilentlyContinue)
$hasPnpm = [bool](Get-Command pnpm -ErrorAction SilentlyContinue)
if (-not $hasCorepack -and -not $hasPnpm) {
  throw "Missing prerequisite: pnpm. Enable Corepack or install pnpm, then rerun."
}

$corepackShimDirectory = $null
if ($hasCorepack -and -not $hasPnpm) {
  $temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  $corepackShimDirectory = [IO.Path]::GetFullPath((Join-Path $temporaryRoot "vcg-console-corepack-$PID"))
  if (-not $corepackShimDirectory.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to create a Corepack shim outside the temporary directory."
  }
  New-Item -ItemType Directory -Force -Path $corepackShimDirectory | Out-Null
  & corepack enable pnpm --install-directory $corepackShimDirectory
  if ($LASTEXITCODE -ne 0) {
    Remove-Item -LiteralPath $corepackShimDirectory -Recurse -Force
    throw "Could not create the temporary Corepack pnpm shim."
  }
  $env:Path = "$corepackShimDirectory;$env:Path"
}

try {
  if ($hasCorepack) {
    & corepack pnpm @PnpmArguments
  } else {
    $installedPnpmVersion = (& pnpm --version).Trim()
    if ($installedPnpmVersion -eq $expectedPnpmVersion) {
      & pnpm @PnpmArguments
    } else {
      & pnpm dlx "pnpm@$expectedPnpmVersion" @PnpmArguments
    }
  }
  if ($LASTEXITCODE -ne 0) {
    throw "pnpm $($PnpmArguments -join ' ') failed with exit code $LASTEXITCODE."
  }
} finally {
  if ($corepackShimDirectory -and (Test-Path -LiteralPath $corepackShimDirectory)) {
    Remove-Item -LiteralPath $corepackShimDirectory -Recurse -Force
  }
}
