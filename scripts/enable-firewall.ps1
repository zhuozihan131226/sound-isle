$ErrorActionPreference = "Stop"
$log = Join-Path $PSScriptRoot "..\data\firewall-result.txt"
$ruleName = "Sound Isle 4310"

try {
  # Recreate the rule so profile/scope changes are deterministic.
  Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue |
    Remove-NetFirewallRule -ErrorAction SilentlyContinue

  New-NetFirewallRule `
    -DisplayName $ruleName `
    -Description "Allow local-network access to the Sound Isle audio workspace" `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 4310 `
    -Action Allow `
    -Profile Any `
    -RemoteAddress LocalSubnet | Out-Null

  "OK $(Get-Date -Format o)" | Set-Content -Path $log -Encoding UTF8
  exit 0
} catch {
  "ERROR $($_.Exception.Message)" | Set-Content -Path $log -Encoding UTF8
  exit 1
}
