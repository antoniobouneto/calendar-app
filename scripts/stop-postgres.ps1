# Para o PostgreSQL 17 portátil (porta 5434)
$pgCtl = 'C:\Users\Usuario\AppData\Local\Temp\opencode\postgres17\pgsql\bin\pg_ctl.exe'
$dataDir = 'C:\Users\Usuario\AppData\Local\Temp\opencode\postgres17\data'

& $pgCtl -D $dataDir stop
Write-Host 'PostgreSQL (portátil) parado.'
