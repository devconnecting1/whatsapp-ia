<#
.SYNOPSIS
    Inicia o painel WhatsApp com IA em modo de produção local.

.DESCRIPTION
    O script:
      1. localiza o Node.js (PATH ou %LOCALAPPDATA%\nodejs\node-*);
      2. instala as dependências, se ainda não existirem;
      3. gera o build da interface, se a pasta dist\ não existir;
      4. inicia o servidor com "npm start" em segundo plano;
      5. abre o painel no navegador em http://127.0.0.1:3333
         (ou na porta definida em .env).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\iniciar.ps1

.NOTES
    Para encerrar o painel, execute:
    powershell -ExecutionPolicy Bypass -File .\parar.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$DefaultPort = 3333

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host ">> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "   OK: $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "   Atenção: $Message" -ForegroundColor Yellow
}

function Stop-WithError {
    param([string]$Message)
    Write-Host ""
    Write-Host "ERRO: $Message" -ForegroundColor Red
    Write-Host ""
    exit 1
}

# Lê a porta configurada em .env (sem carregar o arquivo inteiro no processo).
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

# Procura o node.exe no PATH e nas pastas do Node portátil.
function Find-NodeExecutable {
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($command -and $command.Source) {
        return $command.Source
    }

    $candidates = @()

    if ($env:LOCALAPPDATA) {
        $nodeRoot = Join-Path $env:LOCALAPPDATA "nodejs"
        if (Test-Path -LiteralPath $nodeRoot) {
            $versionDirs = Get-ChildItem -LiteralPath $nodeRoot -Directory -Filter "node-*" -ErrorAction SilentlyContinue |
                Sort-Object Name -Descending
            foreach ($dir in $versionDirs) {
                $candidates += Join-Path $dir.FullName "node.exe"
            }
            $candidates += Join-Path $nodeRoot "node.exe"
        }
    }

    if ($env:ProgramFiles) {
        $candidates += Join-Path $env:ProgramFiles "nodejs\node.exe"
    }

    $programFilesX86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
    if ($programFilesX86) {
        $candidates += Join-Path $programFilesX86 "nodejs\node.exe"
    }

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return $candidate
        }
    }

    return $null
}

# Testa uma porta TCP sem depender de permissões administrativas.
function Test-TcpPort {
    param(
        [string]$TargetHost,
        [int]$PortNumber
    )

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect($TargetHost, $PortNumber, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne(500)) {
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

function Get-PortListener {
    param([int]$PortNumber)
    try {
        return Get-NetTCPConnection -LocalPort $PortNumber -State Listen -ErrorAction Stop |
            Select-Object -First 1
    }
    catch {
        return $null
    }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor DarkCyan
Write-Host "  WhatsApp com IA - iniciar painel" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor DarkCyan

if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "package.json"))) {
    Stop-WithError "package.json não encontrado. Coloque este script na pasta do projeto (whatsapp-ia)."
}

Set-Location -LiteralPath $ProjectRoot
$Port = Get-ConfiguredPort -Root $ProjectRoot -Fallback $DefaultPort
$Url = "http://127.0.0.1:$Port"

# Se o painel (ou o modo dev) já estiver rodando, apenas abre o navegador.
if (Test-TcpPort -TargetHost "127.0.0.1" -PortNumber $Port) {
    $listener = Get-PortListener -PortNumber $Port
    $processName = "processo desconhecido"
    $process = $null

    if ($listener) {
        $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
        if ($process) {
            $processName = "$($process.ProcessName) (PID $($process.Id))"
        }
    }

    if ($process -and $process.ProcessName -ne "node") {
        Stop-WithError "A porta $Port está em uso por $processName. Feche esse programa ou altere PORT no arquivo .env e tente de novo."
    }

    if (Test-TcpPort -TargetHost "127.0.0.1" -PortNumber 5173) {
        Write-Warn "O modo de desenvolvimento parece estar rodando."
        Write-Host "   Abrindo a interface do Vite: http://localhost:5173"
        Start-Process "http://localhost:5173"
        exit 0
    }

    Write-Warn "A porta $Port já está em uso ($processName)."
    Write-Host "   Se for este painel, abrindo no navegador..."
    Start-Process $Url
    Write-Host "   Se a página não estiver correta, execute:"
    Write-Host "   powershell -ExecutionPolicy Bypass -File .\parar.ps1"
    exit 0
}

# 1. Node.js
Write-Step "Procurando o Node.js..."
$nodeExe = Find-NodeExecutable
if (-not $nodeExe) {
    Stop-WithError @"
Node.js não encontrado.

Instale o Node.js 20 ou superior (recomendado: 22 ou 24) e abra um novo terminal.
O script procurou no PATH e em:
  $env:LOCALAPPDATA\nodejs\node-*\node.exe

Se o Node portátil já estiver instalado, confira se o caminho acima existe.
"@
}

$nodeVersion = (& $nodeExe -v 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.') {
    Stop-WithError "Não foi possível executar o Node encontrado em: $nodeExe"
}

$nodeMajor = [int]$Matches[1]
if ($nodeMajor -lt 20) {
    Stop-WithError "Node $nodeVersion encontrado, mas este projeto precisa do Node 20 ou superior. Atualize o Node.js."
}

$nodeDir = Split-Path -Parent $nodeExe
$env:Path = "$nodeDir;$env:Path"
Write-Ok "Node $nodeVersion encontrado."

# 2. npm
$npmCmd = Join-Path $nodeDir "npm.cmd"
if (-not (Test-Path -LiteralPath $npmCmd)) {
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($npmCommand) {
        $npmCmd = $npmCommand.Source
    }
}

if (-not $npmCmd -or -not (Test-Path -LiteralPath $npmCmd)) {
    Stop-WithError "npm não encontrado. Reinstale o Node.js (o npm vem junto) e tente novamente."
}
Write-Ok "npm encontrado."

# 3. Dependências
Write-Step "Verificando as dependências..."
$nodeModules = Join-Path $ProjectRoot "node_modules"
$requiredPaths = @(
    (Join-Path $nodeModules "tsx"),
    (Join-Path $nodeModules "express"),
    (Join-Path $nodeModules "@whiskeysockets\baileys")
)

$dependenciesReady = $true
foreach ($requiredPath in $requiredPaths) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        $dependenciesReady = $false
        break
    }
}

if (-not $dependenciesReady) {
    Write-Warn "Dependências ausentes ou incompletas. Rodando npm install..."
    Write-Host "   Na primeira vez isso pode demorar alguns minutos."
    & $npmCmd install
    if ($LASTEXITCODE -ne 0) {
        Stop-WithError "O npm install falhou. Veja as mensagens acima, confira sua internet e tente novamente."
    }
    Write-Ok "Dependências instaladas."
}
else {
    Write-Ok "Dependências já instaladas."
}

# 4. Build da interface
$distIndex = Join-Path $ProjectRoot "dist\index.html"
if (-not (Test-Path -LiteralPath $distIndex)) {
    Write-Step "Gerando a interface (npm run build)..."
    & $npmCmd run build
    if ($LASTEXITCODE -ne 0) {
        Stop-WithError "O build falhou. Veja as mensagens acima e tente novamente."
    }
    if (-not (Test-Path -LiteralPath $distIndex)) {
        Stop-WithError "O build terminou, mas dist\index.html não foi criado. Verifique o vite.config.ts."
    }
    Write-Ok "Interface gerada em dist\."
}
else {
    Write-Ok "Build existente encontrado em dist\."
}

# 5. Servidor
$dataDir = Join-Path $ProjectRoot "data"
if (-not (Test-Path -LiteralPath $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}

$stdoutLog = Join-Path $dataDir "servidor.log"
$stderrLog = Join-Path $dataDir "servidor-erro.log"
Remove-Item -LiteralPath $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue

Write-Step "Iniciando o servidor com npm start..."
try {
    $serverProcess = Start-Process `
        -FilePath $env:ComSpec `
        -ArgumentList @("/c", "npm start") `
        -WorkingDirectory $ProjectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog `
        -PassThru
}
catch {
    Stop-WithError "Não foi possível iniciar o servidor: $($_.Exception.Message)"
}

Write-Host "   Aguardando o painel responder em $Url ..."
$deadline = (Get-Date).AddSeconds(75)
$ready = $false

while ((Get-Date) -lt $deadline) {
    if (Test-TcpPort -TargetHost "127.0.0.1" -PortNumber $Port) {
        try {
            $health = Invoke-RestMethod -Uri "$Url/api/health" -TimeoutSec 2 -ErrorAction Stop
            if ($health -and $health.ok) {
                $ready = $true
                break
            }
        }
        catch {
            # O servidor ainda pode estar subindo.
        }
    }
    Start-Sleep -Milliseconds 700
}

if (-not $ready) {
    Write-Host ""
    Write-Host "ERRO: o painel não respondeu em 75 segundos." -ForegroundColor Red

    if ($serverProcess -and $serverProcess.HasExited) {
        Write-Host "O processo do servidor foi encerrado (código $($serverProcess.ExitCode))." -ForegroundColor Red
    }

    if (Test-Path -LiteralPath $stdoutLog) {
        $outTail = Get-Content -LiteralPath $stdoutLog -Tail 20 -ErrorAction SilentlyContinue
        if ($outTail) {
            Write-Host ""
            Write-Host "Últimas linhas de data\servidor.log:" -ForegroundColor Yellow
            $outTail | ForEach-Object { Write-Host "   $_" }
        }
    }

    if (Test-Path -LiteralPath $stderrLog) {
        $errTail = Get-Content -LiteralPath $stderrLog -Tail 20 -ErrorAction SilentlyContinue
        if ($errTail) {
            Write-Host ""
            Write-Host "Últimos erros de data\servidor-erro.log:" -ForegroundColor Yellow
            $errTail | ForEach-Object { Write-Host "   $_" }
        }
    }

    Stop-WithError "O servidor não iniciou. Leia as mensagens acima e consulte a seção 'Solução de problemas' do README.md."
}

# 6. Navegador
Start-Process $Url | Out-Null

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Painel iniciado com sucesso!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Endereço: $Url"
Write-Host "  Logs:     data\servidor.log e data\servidor-erro.log"
Write-Host ""
Write-Host "  O servidor continua rodando em segundo plano."
Write-Host "  Para encerrar, execute:"
Write-Host "  powershell -ExecutionPolicy Bypass -File .\parar.ps1"
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
