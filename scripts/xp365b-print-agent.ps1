# Local label print agent for the Xprinter XP-365B (38 mm x 28 mm labels on 40 x 30 mm paper).
#
# Why: a web page cannot send raw label commands to a USB printer, and the Windows "Generic / Text Only"
# driver has no 40 x 30 mm paper size, so browser printing (window.print) never fits the label.
# This small helper runs on the PC the printer is plugged into, listens on 127.0.0.1 only, and turns a
# request from the asset page into printer commands (TSPL) that go straight to the print queue.
#
# Start (leave the window open while printing):
#   powershell -ExecutionPolicy Bypass -File scripts/xp365b-print-agent.ps1
# Other web address for the app (for example the live site):
#   ... -AllowedOrigins "http://localhost:5173","https://assets.example.com"
# Check the request handling without printing a label:
#   ... -DryRun
# Re-learn the label start/length first (new printer, new roll, or labels printing shifted). This feeds
# 2 to 4 blank labels, so use it only when needed; the commands are in scripts/xp365b-calibrate.tspl:
#   ... -Calibrate
#
# Requests (JSON):
#   GET  /health                                      -> {"ok":true,...}
#   POST /print  {"qr":"https://...","lines":["MZ-PHN-004","Samsung"],"copies":1}
param(
    [int]$Port = 9101,
    [string[]]$AllowedOrigins = @("http://localhost:5173", "http://127.0.0.1:5173"),
    [string]$PrinterName = "Xprinter XP-365B",
    [switch]$DryRun,
    [switch]$Calibrate
)

$ErrorActionPreference = "Stop"

# Label geometry. The printer works at 203 dpi = 8 dots per mm.
$dotsPerMm   = 8
$paperWidth  = 40   # mm, backing paper width (across the print head)
$labelWidth  = 38   # mm, across the print head
$labelHeight = 28   # mm, in the feed direction
$gap         = 2    # mm between labels (30 mm paper step - 28 mm label)
$margin      = 3    # mm kept empty around the QR so scanners can read it
# Fine-tuning, as you look at the label coming out of the printer (measured on this printer).
$shiftX      = -3   # mm: negative moves the QR left, positive right
$shiftY      = -1.5 # mm: negative moves the QR up (away from the tear bar), positive down

# Text under the QR (label held upright, 28 mm wide x 38 mm tall), printer font "2".
# Measured on this printer: each character takes 16 dots of width (not the 12 the TSPL manual lists).
$charWidth    = 16   # dots
$charHeight   = 20   # dots
$linePitch    = 22   # dots from one line to the next
$textMargin   = 2    # mm kept empty left and right of the text
$topMargin    = 2.5  # mm above the QR on the upright label
$textGap      = 1.5  # mm between the QR and the first text line
$bottomMargin = 1    # mm below the last text line

$maxBodyBytes = 8192
$maxQrBytes   = 213  # QR version 10, byte mode, error correction M

# Builds the printer commands. Bad input throws an ArgumentException (the caller answers 400).
function New-LabelTspl([string]$Data, [string[]]$Lines, [int]$Copies) {
    if ([string]::IsNullOrWhiteSpace($Data)) { throw [System.ArgumentException]::new("QR data is empty.") }
    if ($Data -match "[\r\n]") { throw [System.ArgumentException]::new("QR data must be a single line.") }
    if ($Copies -lt 1 -or $Copies -gt 100) { throw [System.ArgumentException]::new("Copies must be between 1 and 100.") }

    $textLines = @($Lines | ForEach-Object { "$_".Trim() } | Where-Object { $_ -ne "" })
    $maxChars = [Math]::Floor(($labelHeight - 2 * $textMargin) * $dotsPerMm / $charWidth)
    foreach ($line in $textLines) {
        if ($line -notmatch '^[\x20-\x7E]+$') { throw [System.ArgumentException]::new("Text line '$line' has characters the printer font cannot print.") }
        if ($line.Length -gt $maxChars) { throw [System.ArgumentException]::new("Text line '$line' is too long (max $maxChars characters per line).") }
    }

    # Smallest QR version that holds the data (byte mode, error correction M).
    $bytes = [Text.Encoding]::UTF8.GetBytes($Data)
    $capacity = 14, 26, 42, 62, 84, 106, 122, 152, 180, 213
    $version = 0
    for ($i = 0; $i -lt $capacity.Count; $i++) {
        if ($bytes.Length -le $capacity[$i]) { $version = $i + 1; break }
    }
    if ($version -eq 0) { throw [System.ArgumentException]::new("QR data is too long for this label (max $maxQrBytes bytes, got $($bytes.Length)).") }

    # Largest dot size per QR square that still fits the label's shorter side.
    $modules = 17 + 4 * $version
    $usable  = ([Math]::Min($labelWidth, $labelHeight) - 2 * $margin) * $dotsPerMm
    $cell    = [Math]::Min(10, [Math]::Floor($usable / $modules))
    if ($cell -lt 3) { throw [System.ArgumentException]::new("QR data is too long to print a scannable QR on this label.") }
    $qrSize = $modules * $cell
    $qrText = $Data.Replace('"', '\["]')

    # Centre of the label in printer dots. The printer draws the label rotated 180 degrees
    # from how it is viewed, so the shifts are subtracted.
    $centreX = $paperWidth * $dotsPerMm / 2 - $shiftX * $dotsPerMm
    $centreY = $labelHeight * $dotsPerMm / 2 - $shiftY * $dotsPerMm

    if ($textLines.Count -eq 0) {
        # QR only: centred on the label.
        $x = [Math]::Max(0, [Math]::Floor($centreX - $qrSize / 2))
        $y = [Math]::Max(0, [Math]::Floor($centreY - $qrSize / 2))
        $body = "QRCODE $x,$y,M,$cell,A,0,`"$qrText`"`r`n"
    } else {
        # Upright label (28 mm wide, 38 mm tall): px runs left to right, py top to bottom, in dots.
        # Printer position of an upright point:  x = originX - py,  y = originY + px.
        $uprightWidth  = $labelHeight * $dotsPerMm
        $uprightHeight = $labelWidth * $dotsPerMm
        $originX = $centreX + $uprightHeight / 2
        $originY = $centreY - $uprightWidth / 2

        $qrTop   = $topMargin * $dotsPerMm
        $textTop = $qrTop + $qrSize + $textGap * $dotsPerMm
        $room    = $uprightHeight - $bottomMargin * $dotsPerMm - $textTop
        $maxLines = [Math]::Max(0, [Math]::Floor(($room - $charHeight) / $linePitch) + 1)
        if ($textLines.Count -gt $maxLines) { throw [System.ArgumentException]::new("Too many text lines: $($textLines.Count) given, only $maxLines fit under this QR.") }

        # Centre the block of lines between the QR and the bottom edge, never closer to the QR than the gap.
        $blockHeight  = ($textLines.Count - 1) * $linePitch + $charHeight
        $spaceBelowQr = $uprightHeight - ($qrTop + $qrSize)
        $textTop = [Math]::Max($textTop, $qrTop + $qrSize + ($spaceBelowQr - $blockHeight) / 2)

        # The QR is not rotated (it scans from any side), so only its corner is converted.
        $qrLeft = ($uprightWidth - $qrSize) / 2
        $x = [Math]::Floor($originX - ($qrTop + $qrSize))
        $y = [Math]::Floor($originY + $qrLeft)
        if ($x -lt 0 -or $y -lt 0 -or ($x + $qrSize) -gt ($paperWidth * $dotsPerMm)) { throw [System.ArgumentException]::new("QR does not fit the label with the current fine-tuning shifts.") }
        $body = "QRCODE $x,$y,M,$cell,A,0,`"$qrText`"`r`n"

        # Each line is centred under the QR and turned 90 degrees so it reads on the upright label.
        for ($i = 0; $i -lt $textLines.Count; $i++) {
            $lineLeft = ($uprightWidth - $textLines[$i].Length * $charWidth) / 2
            $lineTop  = $textTop + $i * $linePitch
            $tx = [Math]::Floor($originX - $lineTop)
            $ty = [Math]::Floor($originY + $lineLeft)
            $body += "TEXT $tx,$ty,`"2`",90,1,1,`"$($textLines[$i].Replace('"', '\["]'))`"`r`n"
        }
    }

    return "SIZE $paperWidth mm,$labelHeight mm`r`n" +
           "GAP $gap mm,0 mm`r`n" +
           "REFERENCE 0,0`r`n" +   # clear any position offset stored in this printer
           "SHIFT 0`r`n" +
           "DIRECTION 1`r`n" +
           "CLS`r`n" +
           $body +
           "PRINT $Copies`r`n"
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrint {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFO {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool OpenPrinter(string name, out IntPtr h, IntPtr defaults);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr h);
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern int StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr h, byte[] data, int count, out int written);

    public static string Send(string printer, byte[] data) {
        IntPtr h;
        if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "OpenPrinter failed: " + Marshal.GetLastWin32Error();
        try {
            DOCINFO di = new DOCINFO();
            di.pDocName = "Asset label";
            di.pDataType = "RAW";
            if (StartDocPrinter(h, 1, di) == 0) return "StartDocPrinter failed: " + Marshal.GetLastWin32Error();
            StartPagePrinter(h);
            int written;
            bool ok = WritePrinter(h, data, data.Length, out written);
            int err = Marshal.GetLastWin32Error();
            EndPagePrinter(h);
            EndDocPrinter(h);
            if (!ok) return "WritePrinter failed: " + err;
            if (written != data.Length) return "Only " + written + " of " + data.Length + " bytes were sent";
            return "OK";
        } finally { ClosePrinter(h); }
    }
}
"@

function Send-Json($Response, [int]$Status, $Body, [string]$Origin) {
    $Response.StatusCode = $Status
    $Response.ContentType = "application/json; charset=utf-8"
    $Response.Headers["Cache-Control"] = "no-store"
    if ($Origin) {
        $Response.Headers["Access-Control-Allow-Origin"] = $Origin
        $Response.Headers["Vary"] = "Origin"
        $Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        $Response.Headers["Access-Control-Allow-Headers"] = "Content-Type"
        # Browsers ask this when a public web page calls a local address.
        $Response.Headers["Access-Control-Allow-Private-Network"] = "true"
        $Response.Headers["Access-Control-Max-Age"] = "600"
    }
    if ($Status -eq 204) {
        $Response.ContentLength64 = 0
    } else {
        $bytes = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Compress))
        $Response.ContentLength64 = $bytes.Length
        $Response.OutputStream.Write($bytes, 0, $bytes.Length)
    }
    $Response.OutputStream.Close()
}

# Reads at most $maxBodyBytes of the request body, giving up after 5 seconds.
function Read-Body($Request) {
    $buffer = New-Object byte[] ($maxBodyBytes + 1)
    $total = 0
    while ($total -le $maxBodyBytes) {
        $task = $Request.InputStream.ReadAsync($buffer, $total, $buffer.Length - $total)
        if (-not $task.Wait(5000)) { throw [System.TimeoutException]::new("Request body was not received in time.") }
        if ($task.Result -le 0) { break }
        $total += $task.Result
    }
    if ($total -gt $maxBodyBytes) { throw [System.ArgumentException]::new("Request body is too large.") }
    return [Text.Encoding]::UTF8.GetString($buffer, 0, $total)
}

if (-not $DryRun -and -not (Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue)) {
    Write-Error "Printer '$PrinterName' is not installed on this PC."
    exit 1
}

# Optional start-up calibration: the printer measures the label gap and length again.
if ($Calibrate) {
    $calibrationFile = Join-Path $PSScriptRoot "xp365b-calibrate.tspl"
    if (-not (Test-Path $calibrationFile)) { Write-Error "Calibration file not found: $calibrationFile"; exit 1 }
    $calibration = (Get-Content -Raw $calibrationFile) -replace "`r?`n", "`r`n"
    if ($DryRun) {
        Write-Host "DRY RUN: would calibrate with:`r`n$calibration"
    } else {
        $result = [RawPrint]::Send($PrinterName, [Text.Encoding]::ASCII.GetBytes($calibration))
        if ($result -ne "OK") { Write-Error "Calibration was not accepted by the printer ($result)."; exit 1 }
        Write-Host "Calibration sent: the printer will feed a few blank labels."
    }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
try { $listener.Start() } catch { Write-Error "Cannot listen on 127.0.0.1:$Port ($($_.Exception.Message)). Is the agent already running?"; exit 1 }
Write-Host "XP-365B print agent listening on http://127.0.0.1:$Port/ (printer '$PrinterName'$(if ($DryRun) { ', DRY RUN: nothing is printed' }))"
Write-Host "Allowed web addresses: $($AllowedOrigins -join ', '). Press Ctrl+C to stop."

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        $origin = $request.Headers["Origin"]
        $allowed = [bool]$origin -and ($AllowedOrigins -contains $origin)
        $corsOrigin = if ($allowed) { $origin } else { $null }
        try {
            if ($origin -and -not $allowed) { Send-Json $response 403 @{ ok = $false; error = "This web address is not allowed to print." } $null; continue }
            $path = $request.Url.AbsolutePath
            if ($request.HttpMethod -eq "OPTIONS") { Send-Json $response 204 @{} $corsOrigin; continue }
            if ($request.HttpMethod -eq "GET" -and $path -eq "/health") {
                $found = [bool](Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue)
                Send-Json $response 200 @{ ok = $true; printer = $PrinterName; printerFound = $found; dryRun = [bool]$DryRun } $corsOrigin
                continue
            }
            if ($request.HttpMethod -ne "POST" -or $path -ne "/print") { Send-Json $response 404 @{ ok = $false; error = "Not found." } $corsOrigin; continue }
            # Printing is only for pages in the browser; a request with no web address is refused.
            if (-not $allowed) { Send-Json $response 403 @{ ok = $false; error = "This web address is not allowed to print." } $null; continue }

            $payload = (Read-Body $request) | ConvertFrom-Json
            $copies = if ($null -ne $payload.copies) { [int]$payload.copies } else { 1 }
            $tspl = New-LabelTspl ([string]$payload.qr) @($payload.lines) $copies
            if ($DryRun) {
                Send-Json $response 200 @{ ok = $true; dryRun = $true; tspl = $tspl } $corsOrigin
                continue
            }
            if (-not (Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue)) {
                Send-Json $response 503 @{ ok = $false; error = "Printer '$PrinterName' was not found. Check the USB cable and power." } $corsOrigin
                continue
            }
            $result = [RawPrint]::Send($PrinterName, [Text.Encoding]::UTF8.GetBytes($tspl))
            if ($result -ne "OK") { Send-Json $response 502 @{ ok = $false; error = "The printer did not accept the label ($result)." } $corsOrigin; continue }
            Write-Host "$(Get-Date -Format 'HH:mm:ss') printed $copies label(s)"
            Send-Json $response 200 @{ ok = $true; copies = $copies } $corsOrigin
        } catch [System.ArgumentException] {
            Send-Json $response 400 @{ ok = $false; error = $_.Exception.Message } $corsOrigin
        } catch {
            Write-Host "Request failed: $($_.Exception.Message)"
            try { Send-Json $response 500 @{ ok = $false; error = "The print helper hit an error. See its window." } $corsOrigin } catch { }
        }
    }
} finally {
    $listener.Stop()
}
