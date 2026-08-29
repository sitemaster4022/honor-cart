param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://')]
  [string]$ApiBase,
  [ValidatePattern('^\d+\.\d+\.\d+$')]
  [string]$Version = '1.0.0'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $projectRoot 'extension'
$dist = Join-Path $projectRoot 'artifacts\extension'
$stage = Join-Path $dist 'extension'
$resolvedDist = [System.IO.Path]::GetFullPath($dist)
$resolvedProject = [System.IO.Path]::GetFullPath($projectRoot)
if (-not $resolvedDist.StartsWith($resolvedProject, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to package outside the project directory.'
}

if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null
Copy-Item -Path (Join-Path $source '*') -Destination $stage -Recurse
Remove-Item -LiteralPath (Join-Path $stage 'icons\icon-source.png') -Force
Remove-Item -LiteralPath (Join-Path $stage 'test') -Recurse -Force

$configPath = Join-Path $stage 'config.js'
$extensionConfig = Get-Content -LiteralPath $configPath -Raw
$extensionConfig = [regex]::Replace($extensionConfig, "apiBase:\s*'[^']+'", "apiBase: '$($ApiBase.TrimEnd('/'))'")
Set-Content -LiteralPath $configPath -Value $extensionConfig -NoNewline

$manifestPath = Join-Path $stage 'manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$manifest.version = $Version
$manifest.host_permissions = @($ApiBase.TrimEnd('/') + '/*')
$manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $manifestPath

$zipPath = Join-Path $dist "honorcart-$Version.zip"
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zipPath
Write-Output $zipPath
