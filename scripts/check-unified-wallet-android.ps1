#requires -Version 7.2
param([Parameter(Mandatory=$true)][string]$SdkRoot)
$ErrorActionPreference='Stop'
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$apkFile=Join-Path $repoRoot 'android/app/build/outputs/apk/walletPreview/app-walletPreview.apk'
$reportFile=Join-Path $repoRoot 'android/app/build/test-results/testWalletPreviewUnitTest/TEST-com.jamddmaj.ai.wallet.NativeWalletPublicSelectionTest.xml'
[xml]$nativeReport=Get-Content -LiteralPath $reportFile
if ([int]$nativeReport.testsuite.tests -ne 6 -or [int]$nativeReport.testsuite.failures -ne 0 -or [int]$nativeReport.testsuite.errors -ne 0 -or [int]$nativeReport.testsuite.skipped -ne 0) { throw 'Native public-account checks are incomplete or failed' }
$signer=Join-Path $SdkRoot 'build-tools/36.0.0/apksigner.bat'
& $signer verify --verbose $apkFile
if ($LASTEXITCODE -ne 0) { throw 'Local APK signature verification failed' }
$aapt=Join-Path $SdkRoot 'build-tools/36.0.0/aapt.exe'
$badging=& $aapt dump badging $apkFile
if ($LASTEXITCODE -ne 0 -or -not ($badging | Select-String "^package: name='com.jamddmaj.ai.walletpreview' ")) { throw 'Expected separate preview package identity' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=[IO.Compression.ZipFile]::OpenRead($apkFile)
try {
 foreach ($relative in @('lib/wallet-trading-state.js','lib/wallet-trading-panel.js','lib/wallet-display.js','lib/wallet-portfolio-store.js','lib/terminal-layout.js','assets-wallet-ui.js','private-simulator-ui.js')) {
  $entry=$archive.GetEntry('assets/public/'+$relative)
  if ($null -eq $entry -or $entry.Length -gt 8388608) { throw "Missing or invalid bundled asset: $relative" }
  $stream=$entry.Open();$buffer=[IO.MemoryStream]::new()
  try {$stream.CopyTo($buffer);$packed=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($buffer.ToArray()))}
  finally {$stream.Dispose();$buffer.Dispose()}
  $expected=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $repoRoot ('www/'+$relative))).Hash
  if ($packed -ne $expected) { throw "Outdated Android asset: $relative" }
 }
 if ($null -eq $archive.GetEntry('classes.dex')) { throw 'Missing compiled native code' }
} finally {$archive.Dispose()}
Write-Output 'PASS: 6 native account-state tests; separate preview APK signature/identity; exact current shared wallet assets packaged. No installation or publication.'
