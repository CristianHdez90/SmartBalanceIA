$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$configFile = Join-Path $projectDirectory '.env.local'
$privateKey = Read-Host 'Clave de Groq API (entrada oculta)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($privateKey)
try {
    $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
    if ([string]::IsNullOrWhiteSpace($plainKey) -or $plainKey -match '[\r\n"\s]') { throw 'La clave está vacía o tiene un formato inválido.' }
    $existing = if (Test-Path -LiteralPath $configFile) { Get-Content -LiteralPath $configFile | Where-Object { $_ -notmatch '^\s*GROQ_API_KEY\s*=' } } else { @() }
    $newConfig = @($existing) + ('GROQ_API_KEY="' + $plainKey + '"')
    if (-not ($newConfig | Where-Object { $_ -match '^\s*GROQ_MODEL\s*=' })) { $newConfig += 'GROQ_MODEL=llama-3.3-70b-versatile' }
    [IO.File]::WriteAllLines($configFile, $newConfig, [Text.UTF8Encoding]::new($false))
    Write-Host 'Configuración guardada en .env.local. Reinicia con npm start para activarla.'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $plainKey = $null
    $privateKey.Dispose()
}
