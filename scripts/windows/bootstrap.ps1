$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($env:OS -ne "Windows_NT") {
  throw "This script must run in PowerShell on Windows."
}

if (-not (Test-Path "package.json")) {
  throw "Run this script from the VCG-Console repository root."
}

foreach ($commandName in @("git", "node", "corepack")) {
  if (-not (Get-Command $commandName -ErrorAction SilentlyContinue)) {
    throw "Missing prerequisite: $commandName. Install Git and Node.js 22 or newer, then rerun."
  }
}

$nodeMajor = [int]((& node -p "process.versions.node.split('.')[0]").Trim())
if ($nodeMajor -lt 22) {
  throw "Node.js 22 or newer is required; found $(& node --version)."
}

$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
if (-not ($chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1)) {
  throw "Google Chrome is required for the current end-to-end camera test."
}

& corepack pnpm --version
& corepack pnpm install --frozen-lockfile
& corepack pnpm prepare:assets
& corepack pnpm prepare:schemas
& corepack pnpm typecheck
& corepack pnpm test
& corepack pnpm build
& corepack pnpm validate:manifests
& corepack pnpm test:e2e

Write-Host "Windows repository bootstrap and automated checks passed."
Write-Host "Run scripts\windows\inventory.ps1, then follow docs\WINDOWS_QUALIFICATION.md for real camera and controller checks."
