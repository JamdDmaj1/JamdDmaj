$ErrorActionPreference = "Stop"

$keytool = Get-Command keytool -ErrorAction SilentlyContinue
if (-not $keytool) {
  $candidates = @(
    "$env:ProgramFiles\Android\Android Studio\jbr\bin\keytool.exe",
    "$env:ProgramFiles\Android\Android Studio\jre\bin\keytool.exe"
  )
  $keytoolPath = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $keytoolPath) {
    throw "No se encontro keytool. Instala Android Studio o Java 21 y vuelve a ejecutar este script."
  }
} else {
  $keytoolPath = $keytool.Source
}

function ConvertTo-PlainText([Security.SecureString]$secure) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

$passwordSecure = Read-Host "Crea una contrasena fuerte para la firma Android" -AsSecureString
$password = ConvertTo-PlainText $passwordSecure
if ($password.Length -lt 8) { throw "La contrasena debe tener al menos 8 caracteres." }

$outputDir = Join-Path $PSScriptRoot "..\.android-signing"
$outputDir = [IO.Path]::GetFullPath($outputDir)
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$keystore = Join-Path $outputDir "jamddmaj-release.jks"
if (Test-Path -LiteralPath $keystore) {
  throw "La clave ya existe en $keystore. No la reemplaces: esa misma clave debe firmar todas las actualizaciones."
}

& $keytoolPath -genkeypair -v `
  -keystore $keystore `
  -storepass $password `
  -alias "jamddmaj" `
  -keypass $password `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000 `
  -dname "CN=JamdDmaj AI, OU=Mobile, O=JamdDmaj, L=Unknown, ST=Unknown, C=US"

if ($LASTEXITCODE -ne 0) { throw "No se pudo crear la clave Android." }

$base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($keystore))
Set-Clipboard -Value $base64

Write-Host ""
Write-Host "Clave creada: $keystore" -ForegroundColor Green
Write-Host "El Base64 fue copiado al portapapeles." -ForegroundColor Green
Write-Host "Guarda el archivo .jks y la contrasena en un lugar privado. Si los pierdes, no podras actualizar la app instalada." -ForegroundColor Yellow
Write-Host ""
Write-Host "GitHub Secrets:" -ForegroundColor Cyan
Write-Host "ANDROID_KEYSTORE_BASE64 = pega el contenido del portapapeles"
Write-Host "ANDROID_KEYSTORE_PASSWORD = la contrasena que acabas de crear"
Write-Host "ANDROID_KEY_ALIAS = jamddmaj"
Write-Host "ANDROID_KEY_PASSWORD = la misma contrasena"
