$ErrorActionPreference = "Stop"

function New-PrivateSecret {
    $bytes = New-Object byte[] 48
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    }
    finally {
        $generator.Dispose()
    }
    return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

$cronSecret = New-PrivateSecret
$accountSecret = New-PrivateSecret
$output = @"
JAMDDMAJ_CRON_SECRET=$cronSecret
JAMDDMAJ_ACCOUNT_SECRET=$accountSecret
"@

$file = Join-Path $PSScriptRoot "..\.server-secrets.txt"
[System.IO.File]::WriteAllText($file, $output, [System.Text.Encoding]::UTF8)
Set-Clipboard -Value $output

Write-Host "Private server secrets created." -ForegroundColor Green
Write-Host "Saved locally at: $file"
Write-Host "They were also copied to the clipboard."
Write-Host "Add both to Vercel. Add JAMDDMAJ_CRON_SECRET to GitHub Actions too."
Write-Host "Never commit .server-secrets.txt."
