# Inicia o PostgreSQL 17 portátil (porta 5434, banco calendar_app)
$pgCtl = 'C:\Users\Usuario\AppData\Local\Temp\opencode\postgres17\pgsql\bin\pg_ctl.exe'
$dataDir = 'C:\Users\Usuario\AppData\Local\Temp\opencode\postgres17\data'
$logFile = 'C:\Users\Usuario\AppData\Local\Temp\opencode\postgres17\postgres.log'

& $pgCtl -D $dataDir -l $logFile status
if ($LASTEXITCODE -eq 0) {
  Write-Host 'PostgreSQL (portátil) já está rodando na porta 5434.'
  exit 0
}

& $pgCtl -D $dataDir -l $logFile start
Write-Host 'PostgreSQL (portátil) iniciado na porta 5434.'
