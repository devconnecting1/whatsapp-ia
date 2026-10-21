<#
.SYNOPSIS
    Encerra o painel WhatsApp com IA que estiver ouvindo na porta configurada.

.DESCRIPTION
    Por padrão, encerra o processo que estiver ouvindo na porta 3333.
    Se houver PORT definida no arquivo .env, usa essa porta.
    Também é possível informar outra porta manualmente com -Port.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\parar.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\parar.ps1 -Port 4444
#>
[CmdletBinding()]
param(
    [int]$Port = 0
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

function Write-Warn {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Yellow
}

function Get-ConfiguredPort {
    param(
        [string]$Root,
        [int]$Fallback = 3333
    )

    $envFile = Join-Path $Root ".env"
    if (Test-Path -LiteralPath $envFile) {
        foreach ($line in Get-Content -LiteralPath $envFile -ErrorAction SilentlyContinue) {
            if ($line -match '^\s*PORT\s*=\s*"?(\d{1,5})"?\s*(?:#.*)?$') {
                $candidate = [int]$Matches[1]
                if ($candidate -ge 1 -and $candidate -le 65535) {
                    return $candidate
                }
            }
        }
    }
    return $Fallback
}

function Test-TcpPort {
    param(
        [string]$TargetHost,
        [int]$PortNumber
    )

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect($TargetHost, $PortNumber, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne(400)) {
            return $false
        }
        $client.EndConnect($async)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $client.Close()
    }
}

function Get-Listeners {
    param([int]$PortNumber)
    try {
        return @(Get-NetTCPConnection -LocalPort $PortNumber -State Listen -ErrorAction Stop)
    }
    catch {
        return @()
    }
}

if ($Port -le 0) {
    $Port = Get-ConfiguredPort -Root $ProjectRoot -Fallback 3333
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor DarkCyan
Write-Host "  WhatsApp com IA - parar painel" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "Procurando processo na porta $Port..." -ForegroundColor Cyan

$listeners = Get-Listeners -PortNumber $Port

if (-not $listeners -or $listeners.Count -eq 0) {
    Write-Host ""
    Write-Host "Nada para parar: nenhum processo está ouvindo na porta $Port." -ForegroundColor Yellow
    Write-Host "O painel já está parado ou foi configurado em outra porta."
    Write-Host "Se você alterou PORT no .env, o script usa essa porta automaticamente."
    Write-Host ""
    exit 0
}

$processIds = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
$stoppedAny = $false

foreach ($processId in $processIds) {
    if (-not $processId -or $processId -eq 0) {
        continue
    }

    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if (-not $process) {
        continue
    }

    Write-Host "   Encerrando $($process.ProcessName) (PID $processId)..." -ForegroundColor Yellow
    try {
        Stop-Process -Id $processId -Force -ErrorAction Stop
        $stoppedAny = $true
    }
    catch {
        Write-Warn "   Não foi possível encerrar o PID ${processId}: $($_.Exception.Message)"
    }
}

Start-Sleep -Milliseconds 900
$remaining = Get-Listeners -PortNumber $Port

if ($remaining -and $remaining.Count -gt 0) {
    Write-Host ""
    Write-Host "ERRO: a porta $Port continua em uso." -ForegroundColor Red
    Write-Host "Feche o terminal do servidor ou execute este script como administrador."
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
if ($stoppedAny) {
    Write-Host "  Painel encerrado." -ForegroundColor Green
}
else {
    Write-Host "  A porta $Port foi liberada." -ForegroundColor Green
}
Write-Host "============================================================" -ForegroundColor Green

if (Test-TcpPort -TargetHost "127.0.0.1" -PortNumber 5173) {
    Write-Host ""
    Write-Host "Dica: o Vite (modo dev) ainda está rodando na porta 5173." -ForegroundColor Yellow
    Write-Host "Feche o terminal do 'npm run dev' com Ctrl+C para encerrar tudo."
}

Write-Host ""
