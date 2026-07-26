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
$physicalDisks = @(Get-Disk -ErrorAction SilentlyContinue)
$projectPackageManager = (Get-Content "package.json" -Raw | ConvertFrom-Json).packageManager
$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chromePath = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$chrome = if ($chromePath) {
  [ordered]@{
    path = $chromePath
    version = (Get-Item $chromePath).VersionInfo.ProductVersion
  }
} else {
  $null
}
$pnpmVersion = if (Get-Command corepack -ErrorAction SilentlyContinue) {
  (& corepack pnpm --version).Trim()
} elseif (Get-Command pnpm -ErrorAction SilentlyContinue) {
  (& pnpm --version).Trim()
} else {
  $null
}
[object[]]$nvidiaGpuDetails = if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
  @(
    & nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits |
      ForEach-Object {
        $fields = $_ -split ",\s*"
        [ordered]@{
          name = $fields[0]
          memoryMiB = [int64]$fields[1]
          driverVersion = $fields[2]
        }
      }
  )
} else {
  @()
}
$workingTreeStatus = @(& git status --porcelain)
$report = [ordered]@{
  format = "vcg-windows-qualification-inventory"
  formatVersion = 1
  capturedAt = (Get-Date).ToUniversalTime().ToString("o")
  commit = (& git rev-parse HEAD).Trim()
  branch = (& git branch --show-current).Trim()
  workingTreeClean = $workingTreeStatus.Count -eq 0
  operatingSystem = Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture
  computer = Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model, TotalPhysicalMemory
  processors = @(Get-CimInstance Win32_Processor | Select-Object Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors)
  graphics = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, @{Name = "AdapterRamWmiBytes"; Expression = {$_.AdapterRAM}})
  nvidiaGpuDetails = $nvidiaGpuDetails
  storage = @($physicalDisks | Select-Object Number, FriendlyName, BusType, PartitionStyle, Size, IsBoot, IsSystem, OperationalStatus)
  cameras = @($presentDevices | Where-Object { $_.Class -in @("Camera", "Image") } | Select-Object Class, FriendlyName, InstanceId, Status)
  controllers = @($presentDevices | Where-Object { $_.FriendlyName -match "Xbox|Gamepad|8BitDo|DualSense|DualShock|^Wireless Controller$|Game Controller|Gaming Controller" } | Select-Object Class, FriendlyName, InstanceId, Status)
  chrome = $chrome
  node = (& node --version).Trim()
  pnpm = $pnpmVersion
  rustc = (& rustc --version).Trim()
  cargo = (& cargo --version).Trim()
  projectPackageManager = $projectPackageManager
  caveats = @(
    "Win32_VideoController.AdapterRAM may be truncated above 4 GiB; prefer nvidiaGpuDetails when present.",
    "Device instance IDs are exact local evidence and this artifact is excluded from version control."
  )
}

$report | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 $outputPath
Write-Host "Wrote $outputPath"
