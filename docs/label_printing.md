# Printing asset labels on the Xprinter XP-365B

The **Print Label (XP-365B)** buttons (asset page and the QR dialog in the inventory list) send the label
straight to the printer through a small helper that runs on the PC the printer is plugged into.
Browser printing (`window.print`) cannot fit the label, because the Windows "Generic / Text Only" driver has no
40 x 30 mm paper size.

## One-time setup (the PC with the printer)

1. Plug in the XP-365B and make sure a print queue named `Xprinter XP-365B` exists
   (Settings > Printers). The built-in "Generic / Text Only" driver on port `USB001` is enough.
2. Labels: 38 mm wide x 28 mm tall on 40 x 30 mm paper, 2 mm gap (loaded as in the printer's manual).

## Every time you print

After switching the printer on, press its **FEED** button once so it finds the label start (found in use: without
this the first labels can print shifted).

Start the helper and leave its window open:

```
powershell -ExecutionPolicy Bypass -File scripts/xp365b-print-agent.ps1
```

Then press **Print Label (XP-365B)** on the asset page.

- If the app is not served from `http://localhost:5173`, list its address:
  `... -AllowedOrigins "https://assets.example.com"`.
- Different printer queue name: `-PrinterName "My Printer"`. Different port: `-Port 9102`, and set
  `VITE_LABEL_AGENT_URL=http://127.0.0.1:9102` for the frontend.
- `-DryRun` answers requests without printing, for testing.
- `-Calibrate` makes the printer measure the label gap and length again before the helper starts listening
  (commands in `scripts/xp365b-calibrate.tspl`). Use it for a newly connected printer, a new roll, or when labels
  print shifted. It feeds 2 to 4 blank labels, so it is not done on every start.

Every print also clears any position offset stored in the printer (`REFERENCE 0,0`, `SHIFT 0`), so a printer that
was set up differently on another PC prints in the same place. Windows printer settings do not affect these raw prints.

## What is printed

QR code (the asset's scan link) on top, then up to 4 lines of 12 characters: Miczon ID, device name
(wrapped over 2 lines), department. With "QR + ID Only" selected on the asset page, only the QR is printed.
Characters outside plain English letters, digits and symbols are printed as `?`.

## Safety

The helper listens on `127.0.0.1` only and refuses requests from web addresses that are not in `-AllowedOrigins`
and requests with no web address at all. It never leaves the PC and keeps no data.

## Known limits

- The bulk label dialog (Tools > QR labels) still uses browser printing.
- The on-screen label preview does not yet match the printed layout (preview sizes are for paper printing).
- Fine-tuning of the QR and text position (`$shiftX`, `$shiftY`, `$charWidth`) is measured for one XP-365B unit and
  one label roll; adjust at the top of the script if another printer or roll is slightly off.
