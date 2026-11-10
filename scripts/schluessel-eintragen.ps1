# Trägt einen geheimen Schlüssel in .env.local ein, ohne dass er auf dem Bildschirm erscheint.
# Aufruf im Projektordner:  .\scripts\schluessel-eintragen.ps1                 (Standard: MUREKA_API_KEY)
#                           .\scripts\schluessel-eintragen.ps1 MOLLIE_API_KEY
# Eine vorhandene Zeile mit diesem Namen wird ersetzt, alle anderen Zeilen bleiben unverändert.
param([string]$Name = "MUREKA_API_KEY")
$ErrorActionPreference = "Stop"

if ($Name -notmatch '^[A-Z][A-Z0-9_]*$') { throw "Ungültiger Name: $Name" }
$file = Join-Path (Split-Path $PSScriptRoot -Parent) ".env.local"

$secure = Read-Host "Wert für $Name einfügen (Rechtsklick oder Strg+V, dann Enter)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }

if ([string]::IsNullOrWhiteSpace($value)) { Write-Host "Nichts eingegeben – .env.local bleibt unverändert."; exit 1 }
if ($value -match '\s') { throw "Der Wert enthält Leerzeichen oder Zeilenumbrüche – bitte nur den Schlüssel einfügen." }

$lines = @()
if (Test-Path $file) { $lines = @([IO.File]::ReadAllLines($file) | Where-Object { $_ -notmatch "^$Name=" }) }
$lines += "$Name=$value"
[IO.File]::WriteAllLines($file, [string[]]$lines, (New-Object Text.UTF8Encoding($false)))
$value = $null

Write-Host "✓ $Name ist in .env.local eingetragen ($($lines.Count) Zeilen in der Datei)."
