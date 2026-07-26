param(
  [string]$WslDistribution = "Ubuntu",
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($env:OS -ne "Windows_NT") {
  throw "This script must run in PowerShell on Windows."
}

if (-not (Test-Path "package.json")) {
  throw "Run this script from the VCG-Console repository root."
}

function Invoke-VersionCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [string[]]$Arguments = @()
  )

  if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
    throw "Required command is unavailable: $Command"
  }

  $value = (& $Command @Arguments 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $value) {
    throw "Could not read a version from: $Command $($Arguments -join ' ')"
  }
  return $value
}

function Get-WslVersion {
  if (-not (Get-Command "wsl.exe" -ErrorAction SilentlyContinue)) {
    return $null
  }

  $lines = @(& wsl.exe --version 2>$null) | ForEach-Object { $_ -replace "`0", "" }
  foreach ($line in $lines) {
    if ($line -match "WSL version:\s*([0-9.]+)") {
      return $Matches[1]
    }
  }
  return $null
}

function Invoke-WslText {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  $value = (& wsl.exe -d $WslDistribution -- @Arguments 2>$null | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $value) {
    throw "Could not query WSL distribution '$WslDistribution'."
  }
  return $value
}

$operatingSystem = Get-CimInstance Win32_OperatingSystem
$computer = Get-CimInstance Win32_ComputerSystem
$processors = @(Get-CimInstance Win32_Processor)
if ($processors.Count -ne 1) {
  throw "The baseline capture currently requires exactly one processor package."
}
$processor = $processors[0]

$nvidiaDetails = @()
if (Get-Command "nvidia-smi" -ErrorAction SilentlyContinue) {
  $nvidiaDetails = @(
    & nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits |
      ForEach-Object {
        $fields = $_ -split ",\s*"
        if ($fields.Count -ne 3) {
          throw "Unexpected nvidia-smi output."
        }
        [ordered]@{
          model = $fields[0]
          dedicatedMemoryMiB = [int64]$fields[1]
          driverVersion = $fields[2]
          memoryEvidence = "nvidia-smi"
        }
      }
  )
}
if ($nvidiaDetails.Count -ne 1) {
  throw "The baseline capture currently requires exactly one NVIDIA GPU reported by nvidia-smi."
}

$presentDevices = @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue)
$cameras = @(
  $presentDevices |
    Where-Object { $_.Class -in @("Camera", "Image") } |
    ForEach-Object {
      $vendorProduct = $null
      if ($_.InstanceId -match "VID_([0-9A-F]{4})&PID_([0-9A-F]{4})") {
        $vendorProduct = "$($Matches[1].ToLowerInvariant()):$($Matches[2].ToLowerInvariant())"
      }
      [ordered]@{
        model = $_.FriendlyName
        usbVendorProduct = $vendorProduct
        status = $_.Status
      }
    }
)
$controllers = @(
  $presentDevices |
    Where-Object {
      $_.FriendlyName -match "Xbox|Gamepad|8BitDo|DualSense|DualShock|^Wireless Controller$|Game Controller|Gaming Controller"
    } |
    ForEach-Object {
      [ordered]@{
        model = $_.FriendlyName
        status = $_.Status
      }
    }
)

$projectPackageManager = (Get-Content "package.json" -Raw | ConvertFrom-Json).packageManager
$projectPnpm = if (Get-Command "corepack" -ErrorAction SilentlyContinue) {
  Invoke-VersionCommand "corepack" @("pnpm", "--version")
} else {
  Invoke-VersionCommand "pnpm" @("--version")
}

$wsl = $null
if (Get-Command "wsl.exe" -ErrorAction SilentlyContinue) {
  $osRelease = Invoke-WslText @("cat", "/etc/os-release")
  $prettyName = ($osRelease -split "`n" |
      Where-Object { $_ -match "^PRETTY_NAME=" } |
      Select-Object -First 1) -replace "^PRETTY_NAME=", ""
  $prettyName = $prettyName.Trim().Trim('"')

  $wsl = [ordered]@{
    kind = "wsl2"
    distribution = $prettyName
    distributionName = $WslDistribution
    architecture = Invoke-WslText @("uname", "-m")
    kernel = Invoke-WslText @("uname", "-r")
    node = Invoke-WslText @("node", "--version")
    wslVersion = Get-WslVersion
  }
}

$workingTreeStatus = @(& git status --porcelain)
$capture = [ordered]@{
  format = "vcg-x86-development-host-capture"
  formatVersion = 1
  capturedAt = (Get-Date).ToUniversalTime().ToString("o")
  sourceCommit = (& git rev-parse HEAD).Trim()
  workingTreeClean = $workingTreeStatus.Count -eq 0
  inventory = [ordered]@{
    operatingSystem = [ordered]@{
      name = $operatingSystem.Caption
      version = $operatingSystem.Version
      build = $operatingSystem.BuildNumber
      architecture = $operatingSystem.OSArchitecture
    }
    cpu = [ordered]@{
      model = $processor.Name.Trim()
      physicalCores = [int64]$processor.NumberOfCores
      logicalProcessors = [int64]$processor.NumberOfLogicalProcessors
    }
    memory = [ordered]@{
      physicalBytes = [int64]$computer.TotalPhysicalMemory
    }
    graphics = $nvidiaDetails[0]
    cameras = $cameras
    controllers = $controllers
  }
  runtimes = [ordered]@{
    node = Invoke-VersionCommand "node" @("--version")
    projectPnpm = $projectPnpm
    projectPackageManager = $projectPackageManager
    rustc = Invoke-VersionCommand "rustc" @("--version")
    cargo = Invoke-VersionCommand "cargo" @("--version")
    git = Invoke-VersionCommand "git" @("--version")
  }
  virtualizedLinux = $wsl
  privacy = [ordered]@{
    containsComputerName = $false
    containsUserName = $false
    containsDeviceInstanceIds = $false
    containsSerialNumbers = $false
    containsFilesystemPaths = $false
    containsNetworkAddresses = $false
  }
}

$json = $capture | ConvertTo-Json -Depth 8
if ($OutputPath) {
  $repositoryRoot = [System.IO.Path]::GetFullPath((Get-Location).Path)
  $resolvedOutput = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputPath))
  $relativeOutput = [System.IO.Path]::GetRelativePath($repositoryRoot, $resolvedOutput)
  if ($relativeOutput -eq ".." -or $relativeOutput.StartsWith("..$([System.IO.Path]::DirectorySeparatorChar)")) {
    throw "OutputPath must remain inside the repository."
  }
  $outputDirectory = Split-Path -Parent $resolvedOutput
  if ($outputDirectory) {
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
  }
  Set-Content -Encoding utf8 -Path $resolvedOutput -Value $json
  Write-Host "Wrote $relativeOutput"
} else {
  Write-Output $json
}
