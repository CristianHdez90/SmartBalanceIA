param(
  [Parameter(Mandatory = $true)]
  [string]$ServiceAccountJson
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env.local'
$jsonPath = (Resolve-Path -LiteralPath $ServiceAccountJson).Path
$account = Get-Content -Raw -LiteralPath $jsonPath | ConvertFrom-Json

if ([string]::IsNullOrWhiteSpace($account.project_id) -or
    [string]::IsNullOrWhiteSpace($account.client_email) -or
    [string]::IsNullOrWhiteSpace($account.private_key)) {
  throw 'El archivo no contiene una cuenta de servicio válida de Firebase.'
}

$lines = if (Test-Path -LiteralPath $envPath) {
  [System.Collections.Generic.List[string]](Get-Content -LiteralPath $envPath)
} else {
  [System.Collections.Generic.List[string]]::new()
}

function Set-EnvValue([string]$Name, [string]$Value) {
  $replacement = "$Name=$Value"
  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -match ('^' + [regex]::Escape($Name) + '=')) {
      $lines[$index] = $replacement
      return
    }
  }
  $lines.Add($replacement)
}

$escapedPrivateKey = $account.private_key.Replace("`r", '').Replace("`n", '\n')
Set-EnvValue 'FIREBASE_PROJECT_ID' $account.project_id
Set-EnvValue 'FIREBASE_SERVICE_ACCOUNT_EMAIL' $account.client_email
Set-EnvValue 'FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY' ('"' + $escapedPrivateKey + '"')
Set-Content -LiteralPath $envPath -Value $lines -Encoding utf8

Write-Host 'Cuenta de servicio configurada en .env.local. El archivo JSON original no fue modificado.'
