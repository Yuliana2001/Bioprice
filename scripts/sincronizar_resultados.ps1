[CmdletBinding()]
param(
    [string] $SourceDir = 'G:\Mi unidad\REGISTROS_IMPORTACIONES\_RESULTADOS_BI',
    [string] $DestinationDir = (Join-Path (Split-Path $PSScriptRoot -Parent) 'data\analytics')
)

$ErrorActionPreference = 'Stop'

# Some volumes report zero links because they do not support hard links.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class BioPriceFileInfo {
    [StructLayout(LayoutKind.Sequential)]
    private struct Info {
        public uint Attributes, CreationLow, CreationHigh, AccessLow, AccessHigh;
        public uint WriteLow, WriteHigh, Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
    }
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetFileInformationByHandle(SafeFileHandle handle, out Info info);
    [DllImport("kernel32.dll", EntryPoint = "GetVolumeInformationByHandleW",
        CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool GetVolumeInformationByHandle(
        SafeFileHandle handle, System.Text.StringBuilder volumeName, uint volumeNameSize,
        out uint serial, out uint maximumComponentLength, out uint flags,
        System.Text.StringBuilder fileSystemName, uint fileSystemNameSize);
    public static bool HasSafeLinkCount(SafeFileHandle handle) {
        Info info;
        if (!GetFileInformationByHandle(handle, out info))
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        if (info.Links == 1) return true;
        if (info.Links != 0) return false;
        uint serial, maximumComponentLength, flags;
        if (!GetVolumeInformationByHandle(handle, null, 0, out serial, out maximumComponentLength,
            out flags, null, 0))
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        const uint FILE_SUPPORTS_HARD_LINKS = 0x00400000;
        return (flags & FILE_SUPPORTS_HARD_LINKS) == 0;
    }
}
'@

function Assert-SafePath([string] $Path) {
    $full = [System.IO.Path]::GetFullPath($Path)
    $root = [System.IO.Path]::GetPathRoot($full)
    $current = $root
    foreach ($part in $full.Substring($root.Length).Split([char[]]@('\', '/'), [StringSplitOptions]::RemoveEmptyEntries)) {
        if ($part -ieq '_PARQUET') { throw "Ruta prohibida: $full" }
        $current = Join-Path $current $part
        $item = Get-Item -LiteralPath $current -Force -ErrorAction SilentlyContinue
        if ($null -ne $item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "No se admiten enlaces ni puntos de reparacion: $current"
        }
    }
}

function Assert-FileName([string] $Name) {
    if ([string]::IsNullOrWhiteSpace($Name) -or
        $Name -match '[\\/:*?"<>|\x00-\x1f]' -or
        $Name -notmatch '\.parquet$' -or
        $Name -match '^[.]' -or
        $Name -match '[ .]$' -or
        $Name -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)' -or
        $Name -match '^(?i:_PARQUET)(?:\.|$)') {
        throw "Nombre de archivo no permitido: $Name"
    }
}

function Open-SafeFile([string] $Path) {
    Assert-SafePath $Path
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "No es un archivo regular: $Path"
    }
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        if (-not [BioPriceFileInfo]::HasSafeLinkCount($stream.SafeFileHandle)) {
            throw "No se admiten enlaces duros: $Path"
        }
        return $stream
    } catch {
        $stream.Dispose()
        throw
    }
}

function Assert-SafeTarget([string] $Path) {
    Assert-SafePath $Path
    if (Test-Path -LiteralPath $Path) {
        $existing = Open-SafeFile $Path
        $existing.Dispose()
    }
}

function Write-StagedFile([string] $Target, [IO.Stream] $InputStream) {
    Assert-SafeTarget $Target
    $temp = Join-Path $DestinationDir ('.bioprice-' + [guid]::NewGuid().ToString('N') + '.tmp')
    try {
        $output = [IO.File]::Open($temp, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $InputStream.CopyTo($output); $output.Flush() } finally { $output.Dispose() }
        $sha = [Security.Cryptography.SHA256]::Create()
        try {
            $InputStream.Position = 0
            $expected = [BitConverter]::ToString($sha.ComputeHash($InputStream))
            $check = Open-SafeFile $temp
            try { $actual = [BitConverter]::ToString($sha.ComputeHash($check)) } finally { $check.Dispose() }
        } finally { $sha.Dispose() }
        if ($actual -ne $expected) { throw "La verificacion de la copia fallo: $Target" }
        Assert-SafeTarget $Target
        if ([IO.File]::Exists($Target)) {
            [IO.File]::Replace($temp, $Target, [System.Management.Automation.Language.NullString]::Value)
        } else {
            [IO.File]::Move($temp, $Target)
        }
    } finally {
        if ([IO.File]::Exists($temp)) { [IO.File]::Delete($temp) }
    }
}

function Read-SafeBytes([string] $Path) {
    $stream = Open-SafeFile $Path
    try {
        if ($stream.Length -gt 16MB) { throw 'El manifiesto supera 16 MiB.' }
        $memory = New-Object IO.MemoryStream
        try {
            $stream.CopyTo($memory)
            return ,$memory.ToArray()
        } finally { $memory.Dispose() }
    } finally { $stream.Dispose() }
}

try {
    $SourceDir = [IO.Path]::GetFullPath($SourceDir)
    $DestinationDir = [IO.Path]::GetFullPath($DestinationDir)
    Assert-SafePath $SourceDir
    Assert-SafePath $DestinationDir
    if (-not (Test-Path -LiteralPath $SourceDir -PathType Container)) { throw 'El directorio de origen no existe.' }
    if ($SourceDir.TrimEnd('\') -ieq $DestinationDir.TrimEnd('\')) { throw 'Origen y destino deben ser distintos.' }
    $manifestPath = Join-Path $SourceDir 'manifest_dashboard.json'
    $manifestBytes = Read-SafeBytes $manifestPath
    $utf8 = New-Object Text.UTF8Encoding($false, $true)
    $manifestText = $utf8.GetString($manifestBytes).TrimStart([char]0xFEFF)
    $manifest = ConvertFrom-Json -InputObject $manifestText
    if ($null -eq $manifest -or $manifest -isnot [PSCustomObject] -or
        $null -eq $manifest.PSObject.Properties['visualizaciones'] -or
        $manifest.visualizaciones -isnot [array]) {
        throw 'El manifiesto debe ser un objeto con un arreglo visualizaciones.'
    }
    $names = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    $ids = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in $manifest.visualizaciones) {
        if ($entry -isnot [PSCustomObject]) { throw 'Entrada de visualizacion invalida.' }
        foreach ($property in @('id', 'archivo', 'estado', 'actualizado_en', 'columnas', 'registros', 'motivo')) {
            if ($null -eq $entry.PSObject.Properties[$property]) { throw "Falta el campo $property." }
        }
        if ($entry.id -isnot [string] -or [string]::IsNullOrWhiteSpace($entry.id) -or -not $ids.Add($entry.id)) {
            throw 'ID vacio, invalido o duplicado.'
        }
        if ($entry.estado -cnotin @('disponible', 'no_disponible')) { throw "Estado invalido para $($entry.id)." }
        if ($null -ne $entry.archivo) {
            if ($entry.archivo -isnot [string]) { throw 'El archivo debe ser un nombre o null.' }
            Assert-FileName $entry.archivo
            if (-not $names.Add($entry.archivo)) { throw "Archivo duplicado: $($entry.archivo)" }
        } elseif ($entry.estado -ceq 'disponible') { throw "Falta archivo para $($entry.id)." }
        if ($null -ne $entry.actualizado_en) {
            $date = [DateTimeOffset]::MinValue
            if ($entry.actualizado_en -isnot [string] -or
                $entry.actualizado_en -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$' -or
                -not [DateTimeOffset]::TryParse($entry.actualizado_en, [ref]$date)) {
                throw "Fecha ISO invalida para $($entry.id)."
            }
        }
    }
    if (-not (Test-Path -LiteralPath $DestinationDir -PathType Container)) {
        New-Item -ItemType Directory -Path $DestinationDir -Force | Out-Null
    }
    Assert-SafePath $DestinationDir
} catch {
    [Console]::Error.WriteLine("ERROR de manifiesto o directorio: $($_.Exception.Message). Los resultados existentes son anteriores y se conservan.")
    exit 1
}

$failed = $false
foreach ($entry in $manifest.visualizaciones) {
    if ($entry.estado -ceq 'no_disponible') {
        Write-Output "NO DISPONIBLE: $($entry.id); no se copia. Cualquier archivo existente es anterior."
        continue
    }
    try {
        $source = Join-Path $SourceDir $entry.archivo
        $target = Join-Path $DestinationDir $entry.archivo
        $inputStream = Open-SafeFile $source
        try { Write-StagedFile $target $inputStream } finally { $inputStream.Dispose() }
        Write-Output "COPIADO: $($entry.id) ($($entry.archivo))"
    } catch {
        $failed = $true
        [Console]::Error.WriteLine("ERROR de copia: $($entry.id) ($($entry.archivo)): $($_.Exception.Message). Si existe un resultado previo, es anterior y se conserva.")
    }
}

if (-not $failed) {
    try {
        $manifestStream = New-Object IO.MemoryStream(,$manifestBytes)
        try {
            Write-StagedFile (Join-Path $DestinationDir 'manifest_dashboard.json') $manifestStream
        } finally { $manifestStream.Dispose() }
        Write-Output 'MANIFIESTO actualizado.'
    } catch {
        $failed = $true
        [Console]::Error.WriteLine("ERROR al publicar el manifiesto: $($_.Exception.Message). El manifiesto previo es anterior y se conserva.")
    }
} else {
    [Console]::Error.WriteLine('MANIFIESTO no actualizado: el manifiesto previo es anterior y se conserva.')
}
if ($failed) { exit 2 }
exit 0
