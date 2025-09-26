Write-Host "=================================" -ForegroundColor Green
Write-Host "   DIG Node Windows Installer" -ForegroundColor Green
Write-Host "=================================" -ForegroundColor Green
Write-Host ""
Write-Host "This will install DIG Node CLI with Windows service support." -ForegroundColor Yellow
Write-Host "You need to run this as Administrator." -ForegroundColor Yellow
Write-Host ""

# Ensure we're running from the correct directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $scriptPath
Write-Host "Working directory: $scriptPath" -ForegroundColor Gray
Write-Host ""

# Check if running as Administrator
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click on install.ps1 and select 'Run as Administrator'" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "SUCCESS: Running as Administrator" -ForegroundColor Green
Write-Host ""

# Check if Node.js is installed
Write-Host "Checking Node.js installation..." -ForegroundColor White
$nodeVersion = & node --version 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrEmpty($nodeVersion)) {
    Write-Host "ERROR: Node.js not found!" -ForegroundColor Red
    Write-Host "Please install Node.js 18+ from https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "SUCCESS: Node.js found: $nodeVersion" -ForegroundColor Green

# Check Node.js version (require 18+)
$versionNumber = $nodeVersion -replace 'v', '' -split '\.' | Select-Object -First 1
if ([int]$versionNumber -lt 18) {
    Write-Host "ERROR: Node.js version $nodeVersion is too old!" -ForegroundColor Red
    Write-Host "Please install Node.js 18+ from https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Installing DIG Node..." -ForegroundColor Cyan

# Verify package.json exists
if (-not (Test-Path "package.json")) {
    Write-Host "ERROR: package.json not found in current directory!" -ForegroundColor Red
    Write-Host "Current directory: $(Get-Location)" -ForegroundColor Yellow
    Write-Host "Please ensure the script is running from the dig-node directory" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Install dependencies
Write-Host "1. Installing dependencies..." -ForegroundColor White
if (Test-Path "node_modules") {
    Write-Host "   Dependencies already exist, running npm install to ensure they're up to date..." -ForegroundColor Gray
} else {
    Write-Host "   Running: npm install" -ForegroundColor Gray
}
& npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ERROR: Failed to install dependencies" -ForegroundColor Red
    Write-Host "   Please check the error messages above" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "   SUCCESS: Dependencies ready" -ForegroundColor Green

# Build the project
Write-Host "2. Building project..." -ForegroundColor White
Write-Host "   Running: npm run build" -ForegroundColor Gray
& npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ERROR: Build failed" -ForegroundColor Red
    Write-Host "   Please check the error messages above" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "   SUCCESS: Project built successfully" -ForegroundColor Green

# Install CLI globally
Write-Host "3. Installing CLI globally..." -ForegroundColor White
Write-Host "   Running: npm link" -ForegroundColor Gray
& npm link
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ERROR: Failed to install CLI globally" -ForegroundColor Red
    Write-Host "   Please check the error messages above" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "   SUCCESS: CLI installed globally" -ForegroundColor Green

# Test CLI installation
Write-Host "4. Testing CLI installation..." -ForegroundColor White
$cliTest = & dig-node --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ERROR: CLI test failed" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "   SUCCESS: CLI working: $cliTest" -ForegroundColor Green

Write-Host ""
Write-Host "=================================" -ForegroundColor Green
Write-Host "   Installation Complete!" -ForegroundColor Green
Write-Host "=================================" -ForegroundColor Green
Write-Host ""
Write-Host "Available commands:" -ForegroundColor White
Write-Host "  dig-node config          - Generate configuration file" -ForegroundColor Gray
Write-Host "  dig-node start           - Start node in foreground" -ForegroundColor Gray
Write-Host "  dig-node install-service - Install as Windows service" -ForegroundColor Gray
Write-Host "  dig-node start-service   - Start the service" -ForegroundColor Gray
Write-Host "  dig-node status          - Check service status" -ForegroundColor Gray
Write-Host "  dig-node --help          - Show all commands" -ForegroundColor Gray
Write-Host ""
Write-Host "Quick start:" -ForegroundColor Yellow
Write-Host "1. dig-node config" -ForegroundColor White
Write-Host "2. dig-node install-service" -ForegroundColor White
Write-Host "3. dig-node start-service" -ForegroundColor White
Write-Host ""
Write-Host "The service will automatically start on system boot." -ForegroundColor Cyan
Write-Host ""
Read-Host "Press Enter to finish"