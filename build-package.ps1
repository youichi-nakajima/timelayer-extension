[CmdletBinding()]
param(
    [string]$OutputDir = "dist"
)

$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
if (-not $projectRoot) {
    $projectRoot = (Get-Location).Path
}

$manifestPath = Join-Path $projectRoot "manifest.json"
if (-not (Test-Path $manifestPath)) {
    Write-Error "manifest.json not found: $manifestPath"
    exit 1
}

$manifestJson = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $manifestJson.version
$name = $manifestJson.name

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " TimeLayer - Chrome Web Store Package Builder" -ForegroundColor Cyan
Write-Host " Target Version: $version" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

$distPath = Join-Path $projectRoot $OutputDir
if (-not (Test-Path $distPath)) {
    New-Item -ItemType Directory -Path $distPath -Force | Out-Null
}

$zipFileName = "timelayer-v$version.zip"
$zipFilePath = Join-Path $distPath $zipFileName

if (Test-Path $zipFilePath) {
    Write-Host "Removing existing archive: $zipFileName" -ForegroundColor Yellow
    Remove-Item -Path $zipFilePath -Force
}

$includeItems = @(
    "manifest.json",
    "background.js",
    "timelayer-core.js",
    "sidepanel.html",
    "sidepanel.css",
    "sidepanel.js",
    "dashboard.html",
    "dashboard.css",
    "dashboard.js",
    "content.js",
    "content.css",
    "icons"
)

$stageDir = Join-Path $distPath "staging"
if (Test-Path $stageDir) {
    Remove-Item -Path $stageDir -Recurse -Force
}
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

try {
    Write-Host "`n[1/3] Staging production files..." -ForegroundColor Yellow
    foreach ($item in $includeItems) {
        $sourcePath = Join-Path $projectRoot $item
        if (Test-Path $sourcePath) {
            $destPath = Join-Path $stageDir $item
            Copy-Item -Path $sourcePath -Destination $destPath -Recurse -Force
            Write-Host "  + $item" -ForegroundColor Gray
        } else {
            Write-Warning "Required item not found: $item"
        }
    }

    Get-ChildItem -Path $stageDir -Recurse -Force -Include ".DS_Store", "Thumbs.db", "*.tmp" | Remove-Item -Force

    Write-Host "`n[2/3] Compressing ZIP archive..." -ForegroundColor Yellow
    Compress-Archive -Path "$stageDir\*" -DestinationPath $zipFilePath -CompressionLevel Optimal

    $zipInfo = Get-Item $zipFilePath
    $sizeKb = [Math]::Round($zipInfo.Length / 1024, 2)

    Write-Host "`n[3/3] Package generated successfully!" -ForegroundColor Green
    Write-Host "  Destination: $zipFilePath" -ForegroundColor White
    Write-Host "  Package Size: $sizeKb KB" -ForegroundColor White

    Write-Host "`nPackage Contents:" -ForegroundColor Cyan
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($zipFilePath)
    foreach ($entry in $zip.Entries) {
        $entrySizeKb = [Math]::Round($entry.Length / 1024, 1)
        Write-Host ("  {0,-35} ({1,5} KB)" -f $entry.FullName, $entrySizeKb) -ForegroundColor DarkGray
    }
    $zip.Dispose()

    Write-Host "`nReady for Chrome Web Store upload!" -ForegroundColor Green
}
finally {
    if (Test-Path $stageDir) {
        Remove-Item -Path $stageDir -Recurse -Force
    }
}
