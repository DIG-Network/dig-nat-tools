# DIG Node Windows Installer
# This script installs the DIG Node CLI and sets up Windows service capabilities

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "    DIG Node Windows Installer    " -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "❌ This installer requires Administrator privileges." -ForegroundColor Red
    Write-Host "💡 Please run this script as Administrator." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "✅ Running with Administrator privileges" -ForegroundColor Green
Write-Host ""

# Check if Node.js is installed
try {
    $nodeVersion = node --version 2>$null
    if ($nodeVersion) {
        Write-Host "✅ Node.js is installed: $nodeVersion" -ForegroundColor Green
    } else {
        throw "Node.js not found"
    }
} catch {
    Write-Host "❌ Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host "💡 Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if npm is available
try {
    $npmVersion = npm --version 2>$null
    if ($npmVersion) {
        Write-Host "✅ npm is available: $npmVersion" -ForegroundColor Green
    } else {
        throw "npm not found"
    }
} catch {
    Write-Host "❌ npm is not available" -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""

# Get the current directory (where the installer is running from)
$currentDir = Get-Location
Write-Host "📁 Installing from: $currentDir" -ForegroundColor Blue

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Blue
try {
    npm install
    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed"
    }
    Write-Host "✅ Dependencies installed successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Build the project
Write-Host "🔨 Building the project..." -ForegroundColor Blue
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "build failed"
    }
    Write-Host "✅ Project built successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to build project" -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Install globally using npm link
Write-Host "🔗 Installing CLI globally..." -ForegroundColor Blue
try {
    npm link
    if ($LASTEXITCODE -ne 0) {
        throw "npm link failed"
    }
    Write-Host "✅ CLI installed globally" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to install CLI globally" -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Create a sample configuration
Write-Host "📝 Creating sample configuration..." -ForegroundColor Blue
try {
    dig-node config -o "$env:USERPROFILE\.dig\dig-node-config.json"
    Write-Host "✅ Sample configuration created at: $env:USERPROFILE\.dig\dig-node-config.json" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Could not create sample config, but installation succeeded" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Green
Write-Host "   ✅ Installation Complete!     " -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Green
Write-Host ""
Write-Host "🎉 DIG Node CLI is now installed!" -ForegroundColor Green
Write-Host ""
Write-Host "Available commands:" -ForegroundColor White
Write-Host "  dig-node --help                    # Show all commands" -ForegroundColor Gray
Write-Host "  dig-node config                    # Generate config file" -ForegroundColor Gray
Write-Host "  dig-node start                     # Start in foreground" -ForegroundColor Gray
Write-Host "  dig-node install-service           # Install as Windows service" -ForegroundColor Gray
Write-Host "  dig-node start-service             # Start the service" -ForegroundColor Gray
Write-Host "  dig-node stop-service              # Stop the service" -ForegroundColor Gray
Write-Host "  dig-node status                    # Check service status" -ForegroundColor Gray
Write-Host "  dig-node uninstall-service         # Remove the service" -ForegroundColor Gray
Write-Host ""
Write-Host "📚 Quick Start:" -ForegroundColor Yellow
Write-Host "  1. Edit the config: $env:USERPROFILE\.dig\dig-node-config.json" -ForegroundColor Gray
Write-Host "  2. Install as service: dig-node install-service -c $env:USERPROFILE\.dig\dig-node-config.json" -ForegroundColor Gray
Write-Host "  3. Start the service: dig-node start-service" -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter to finish"