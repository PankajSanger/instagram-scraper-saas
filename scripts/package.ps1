param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot ".."))
)

$ErrorActionPreference = "Stop"

$manifestPath = Join-Path $ProjectRoot "manifest.json"
if (-not (Test-Path $manifestPath)) {
  throw "manifest.json not found at $manifestPath"
}

$manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json
$version = $manifest.version
if (-not $version) {
  throw "Version is missing in manifest.json"
}

$distDir = Join-Path $ProjectRoot "dist"
if (-not (Test-Path $distDir)) {
  New-Item -ItemType Directory -Path $distDir | Out-Null
}

$zipName = "instagram-comments-scraper-v$version.zip"
$zipPath = Join-Path $distDir $zipName
if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

$include = @(
  "manifest.json",
  "popup.html",
  "popup.js",
  "assets/icons/icon-16.png",
  "assets/icons/icon-32.png",
  "assets/icons/icon-48.png",
  "assets/icons/icon-128.png",
  "README.md",
  "PRIVACY_POLICY.md",
  "TERMS.md",
  "CHANGELOG.md"
)

$items = @()
foreach ($name in $include) {
  $path = Join-Path $ProjectRoot $name
  if (Test-Path $path) {
    $items += $path
  }
}

if ($items.Count -eq 0) {
  throw "No files found to package."
}

Compress-Archive -Path $items -DestinationPath $zipPath -CompressionLevel Optimal
Write-Output "Created: $zipPath"
