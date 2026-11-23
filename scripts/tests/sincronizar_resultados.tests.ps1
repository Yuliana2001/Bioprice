$ErrorActionPreference = 'Stop'
$script = Join-Path (Split-Path $PSScriptRoot -Parent) 'sincronizar_resultados.ps1'
$root = Join-Path $PSScriptRoot ('.prueba-' + [guid]::NewGuid().ToString('N'))
$powershell = Join-Path $PSHOME 'powershell.exe'
$checks = 0

function Check([bool] $Condition, [string] $Message) {
    $script:checks++
    if (-not $Condition) { throw "Fallo: $Message" }
}

function Entry([string] $Id, $File, [string] $State) {
    return @{
        id = $Id; archivo = $File; estado = $State; actualizado_en = '2026-01-02T03:04:05Z'
        columnas = @('valor'); registros = 1; motivo = $null
    }
}

function Fixture([string] $Name) {
    $base = Join-Path $root $Name
    $src = Join-Path $base 'origen'
    $dst = Join-Path $base 'destino'
    New-Item -ItemType Directory -Path $src, $dst -Force | Out-Null
    return @{ src = $src; dst = $dst; base = $base }
}

function Manifest($Fixture, [array] $Entries) {
    @{ visualizaciones = $Entries } | ConvertTo-Json -Depth 8 |
        Set-Content -LiteralPath (Join-Path $Fixture.src 'manifest_dashboard.json') -Encoding UTF8
}

function Run-Sync($Fixture) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $powershell -NoLogo -NoProfile -NonInteractive -File $script `
            -SourceDir $Fixture.src -DestinationDir $Fixture.dst 2>&1
        $code = $LASTEXITCODE
        return @{ code = $code; output = ($output | Out-String) }
    } finally { $ErrorActionPreference = $old }
}

try {
    New-Item -ItemType Directory -Path $root | Out-Null
    $f = Fixture 'exito'
    Manifest $f @((Entry 'id-nuevo' 'grafica.parquet' 'disponible'), (Entry 'ausente' 'anterior.parquet' 'no_disponible'))
    [IO.File]::WriteAllText((Join-Path $f.src 'grafica.parquet'), 'nuevo')
    [IO.File]::WriteAllText((Join-Path $f.src 'anterior.parquet'), 'no copiar')
    [IO.File]::WriteAllText((Join-Path $f.src 'ajeno.parquet'), 'no copiar')
    [IO.File]::WriteAllText((Join-Path $f.dst 'grafica.parquet'), 'viejo')
    [IO.File]::WriteAllText((Join-Path $f.dst 'anterior.parquet'), 'previo')
    $r = Run-Sync $f
    Check ($r.code -eq 0) "sincronizacion exitosa: $($r.output)"
    Check ([IO.File]::ReadAllText((Join-Path $f.dst 'grafica.parquet')) -eq 'nuevo') 'reemplazo correcto'
    Check ([IO.File]::ReadAllText((Join-Path $f.dst 'anterior.parquet')) -eq 'previo') 'no disponible conservado'
    Check (-not (Test-Path (Join-Path $f.dst 'ajeno.parquet'))) 'archivo ajeno ignorado'
    Check ((Get-FileHash (Join-Path $f.src 'manifest_dashboard.json')).Hash -eq (Get-FileHash (Join-Path $f.dst 'manifest_dashboard.json')).Hash) 'manifiesto identico'
    Check ($r.output -match 'anterior') 'aviso de resultado anterior'

    $f = Fixture 'fallo-copia'
    Manifest $f @((Entry 'falta' 'falta.parquet' 'disponible'), (Entry 'otra' 'otra.parquet' 'disponible'))
    [IO.File]::WriteAllText((Join-Path $f.src 'otra.parquet'), 'correcta')
    [IO.File]::WriteAllText((Join-Path $f.dst 'falta.parquet'), 'anterior')
    [IO.File]::WriteAllText((Join-Path $f.dst 'manifest_dashboard.json'), 'manifiesto previo')
    $r = Run-Sync $f
    Check ($r.code -eq 2) 'error de copia tiene codigo 2'
    Check ([IO.File]::ReadAllText((Join-Path $f.dst 'falta.parquet')) -eq 'anterior') 'archivo fallido conservado'
    Check ([IO.File]::ReadAllText((Join-Path $f.dst 'otra.parquet')) -eq 'correcta') 'errores independientes'
    Check ([IO.File]::ReadAllText((Join-Path $f.dst 'manifest_dashboard.json')) -eq 'manifiesto previo') 'manifiesto anterior conservado'
    Check ($r.output -match 'anterior' -and $r.output -match 'ERROR de copia') 'error y antiguedad informados'

    foreach ($name in @('..\escape.parquet', 'C:\escape.parquet', '_PARQUET.parquet', 'grafica.csv', 'CON.parquet', 'archivo.parquet:flujo')) {
        $f = Fixture ('invalido-' + [guid]::NewGuid().ToString('N'))
        Manifest $f @((Entry 'buena' 'buena.parquet' 'disponible'), (Entry 'mala' $name 'disponible'))
        [IO.File]::WriteAllText((Join-Path $f.src 'buena.parquet'), 'no copiar')
        $r = Run-Sync $f
        Check ($r.code -eq 1) "ruta invalida rechazada: $name"
        Check (-not (Test-Path (Join-Path $f.dst 'buena.parquet'))) 'validacion antes de copiar'
    }

    $f = Fixture 'duplicado'
    Manifest $f @((Entry 'uno' 'dato.parquet' 'disponible'), (Entry 'dos' 'DATO.parquet' 'disponible'))
    Check ((Run-Sync $f).code -eq 1) 'nombres duplicados rechazados'

    $f = Fixture 'enlace-origen'
    Manifest $f @((Entry 'enlace' 'dato.parquet' 'disponible'))
    $real = Join-Path $f.base 'real.parquet'
    [IO.File]::WriteAllText($real, 'no copiar')
    New-Item -ItemType HardLink -Path (Join-Path $f.src 'dato.parquet') -Target $real | Out-Null
    $r = Run-Sync $f
    Check ($r.code -eq 2) 'enlace duro de origen rechazado'
    Check (-not (Test-Path (Join-Path $f.dst 'dato.parquet'))) 'enlace no copiado'

    $f = Fixture 'enlace-destino'
    Manifest $f @((Entry 'enlace' 'dato.parquet' 'disponible'))
    [IO.File]::WriteAllText((Join-Path $f.src 'dato.parquet'), 'nuevo')
    $real = Join-Path $f.base 'real.parquet'
    [IO.File]::WriteAllText($real, 'protegido')
    New-Item -ItemType HardLink -Path (Join-Path $f.dst 'dato.parquet') -Target $real | Out-Null
    $r = Run-Sync $f
    Check ($r.code -eq 2) 'enlace duro de destino rechazado'
    Check ([IO.File]::ReadAllText($real) -eq 'protegido') 'archivo enlazado protegido'

    $f = Fixture 'junction'
    $link = Join-Path $f.base 'vinculo'
    New-Item -ItemType Junction -Path $link -Target $f.src | Out-Null
    $r = Run-Sync @{ src = $link; dst = $f.dst }
    Check ($r.code -eq 1) 'directorio enlazado rechazado'

    $f = Fixture 'parquet'
    $forbidden = Join-Path $f.base '_PARQUET'
    New-Item -ItemType Directory -Path $forbidden | Out-Null
    $r = Run-Sync @{ src = $forbidden; dst = $f.dst }
    Check ($r.code -eq 1) 'directorio _PARQUET rechazado'

    $f = Fixture 'destino-directorio'
    Manifest $f @((Entry 'dir' 'dato.parquet' 'disponible'))
    [IO.File]::WriteAllText((Join-Path $f.src 'dato.parquet'), 'nuevo')
    New-Item -ItemType Directory -Path (Join-Path $f.dst 'dato.parquet') | Out-Null
    $r = Run-Sync $f
    Check ($r.code -eq 2) 'destino directorio rechazado'
    Check (Test-Path (Join-Path $f.dst 'dato.parquet') -PathType Container) 'directorio no eliminado'

    Write-Output "OK: $checks comprobaciones."
} finally {
    if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
