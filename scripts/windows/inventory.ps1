$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($env:OS -ne "Windows_NT") {
  throw "This script must run in PowerShell on Windows."
}

if (-not (Test-Path "package.json")) {
  throw "Run this script from the VCG-Console repository root."
}

$outputDirectory = Join-Path (Get-Location) "artifacts\windows-qualification"
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputPath = Join-Path $outputDirectory "inventory-$timestamp.json"

$presentDevices = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue
$report = [ordered]@{
  capturedAt = (Get-Date).ToUniversalTime().ToString("o")
  commit = (& git rev-parse HEAD).Trim()
  branch = (& git branch --show-current).Trim()
  operatingSystem = Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture
  computer = Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model, TotalPhysicalMemory
  processors = @(Get-CimInstance Win32_Processor | Select-Object Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors)
  graphics = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, AdapterRAM)
  cameras = @($presentDevices | Where-Object { $_.Class -in @("Camera", "Image") } | Select-Object Class, FriendlyName, InstanceId, Status)
  controllers = @($presentDevices | Where-Object { $_.FriendlyName -match "Xbox|Controller|Gamepad|8BitDo|DualSense|DualShock" } | Select-Object Class, FriendlyName, InstanceId, Status)
  node = (& node --version).Trim()
  pnpm = (& corepack pnpm --version).Trim()
}

$report | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 $outputPath
Write-Host "Wrote $outputPath"
