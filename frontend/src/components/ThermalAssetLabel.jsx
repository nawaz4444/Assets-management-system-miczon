import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { getQrPayload } from '../lib/api';

export const LABEL_SIZES = {
  '3x2in': {
    id: '3x2in',
    name: '3.00 in × 2.00 in (Single Sticker) ★ Default',
    widthMm: 76.2,
    heightMm: 50.8,
    pageSize: '3.00in 2.00in',
    isLarge: true,
    layout: 'large-landscape',
  },
  '3x4in': {
    id: '3x4in',
    name: '3.00 in × 4.00 in (Two-Sticker Stock)',
    widthMm: 76.2,
    heightMm: 101.6,
    pageSize: '3.00in 4.00in',
    isLarge: true,
    layout: 'large-portrait',
  },
  'xp365b-60': {
    id: 'xp365b-60',
    name: 'XP-365B 60% Scale (Single Label Fit)',
    widthMm: 45.7,  // 76.2mm * 0.60
    heightMm: 61.0, // 101.6mm * 0.60
    pageSize: '46mm 61mm',
    isLarge: false,
    layout: 'calibrated-60',
  },
  '4x3in': {
    id: '4x3in',
    name: '4.00 in × 3.00 in (Landscape)',
    widthMm: 101.6,
    heightMm: 76.2,
    pageSize: '4.00in 3.00in',
    isLarge: true,
    layout: 'large-landscape',
  },
  '40x30mm': {
    id: '40x30mm',
    name: '40 mm × 30 mm (Compact 4×3 cm)',
    widthMm: 40,
    heightMm: 30,
    pageSize: '40mm 30mm',
    isLarge: false,
    layout: 'side-by-side',
  },
  '50x30mm': {
    id: '50x30mm',
    name: '50 mm × 30 mm',
    widthMm: 50,
    heightMm: 30,
    pageSize: '50mm 30mm',
    isLarge: false,
    layout: 'side-by-side',
  },
};

/**
 * ThermalAssetLabel
 * Specifically calibrated for Xprinter XP-365B direct thermal printer.
 * Adjusted to 60% scale so it naturally prints the entire tag on a single barcode label.
 */
export function ThermalAssetLabel({
  miczonId,
  name = '',
  department = '',
  custodian = '',
  layout = 'auto', // 'auto' | 'calibrated-60' | 'large-portrait' | 'large-landscape' | 'side-by-side' | 'stacked' | 'qr-only'
  sizePreset = '3x2in',
  widthMm,
  heightMm,
  brand = 'MICZON',
  border = true,
  scale = 1,
  className = '',
  style = {},
}) {
  const qrValue = getQrPayload(miczonId);
  const cleanId = String(miczonId || '').trim();

  // Resolve dimensions
  const presetConfig = LABEL_SIZES[sizePreset] || LABEL_SIZES['3x2in'];
  const finalWidth = widthMm || presetConfig.widthMm;
  const finalHeight = heightMm || presetConfig.heightMm;
  const isLarge = finalWidth >= 65 || finalHeight >= 65;
  const isPortrait = finalHeight > finalWidth;

  // Resolve layout
  let activeLayout = layout;
  if (activeLayout === 'auto') {
    activeLayout = presetConfig.layout || (isLarge ? (isPortrait ? 'large-portrait' : 'large-landscape') : 'calibrated-60');
  }

  return (
    <div
      className={`thermal-label-tag layout-${activeLayout} ${border ? 'has-border' : 'borderless'} ${className}`.trim()}
      style={{
        width: `${finalWidth}mm`,
        height: `${finalHeight}mm`,
        maxWidth: `${finalWidth}mm`,
        maxHeight: `${finalHeight}mm`,
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'top left',
        ...style,
      }}
      data-miczon-id={cleanId}
    >
      {/* 60% Scale Calibrated Layout for XP-365B Single Label Print */}
      {activeLayout === 'calibrated-60' && (
        <div className="thermal-label-inner calibrated-60">
          <div className="thermal-cal-header">
            <div className="thermal-cal-brand">{brand} ASSET TAG</div>
            <div className="thermal-cal-badge">HARDWARE ID</div>
          </div>

          <div className="thermal-cal-qr">
            <QRCodeCanvas
              value={qrValue}
              size={220}
              level="M"
              includeMargin={false}
              style={{
                width: '26mm',
                height: '26mm',
                display: 'block',
                margin: '0 auto',
              }}
            />
          </div>

          <div className="thermal-cal-id-box">
            <div className="thermal-cal-id-title">MICZON ID</div>
            <div className="thermal-cal-id">{cleanId}</div>
          </div>

          <div className="thermal-cal-details">
            <div className="thermal-cal-row">
              <span className="thermal-cal-label">Device:</span>
              <span className="thermal-cal-value">{name || 'Unassigned Device'}</span>
            </div>
            {department && (
              <div className="thermal-cal-row">
                <span className="thermal-cal-label">Dept:</span>
                <span className="thermal-cal-value">{department}</span>
              </div>
            )}
            {custodian && (
              <div className="thermal-cal-row">
                <span className="thermal-cal-label">Assigned:</span>
                <span className="thermal-cal-value">{custodian}</span>
              </div>
            )}
          </div>

          <div className="thermal-cal-footer">
            <span>OFFICIAL PROPERTY • DO NOT REMOVE</span>
          </div>
        </div>
      )}

      {/* 3" x 4" Large Portrait Layout */}
      {activeLayout === 'large-portrait' && (
        <div className="thermal-label-inner large-portrait">
          <div className="thermal-large-header">
            <div className="thermal-large-brand">{brand} ASSET MANAGEMENT</div>
            <div className="thermal-large-badge">PROPERTY OF {brand}</div>
          </div>

          <div className="thermal-large-qr">
            <QRCodeCanvas
              value={qrValue}
              size={260}
              level="M"
              includeMargin={false}
              style={{
                width: '42mm',
                height: '42mm',
                display: 'block',
                margin: '0 auto',
              }}
            />
          </div>

          <div className="thermal-large-id-box">
            <div className="thermal-large-id-title">MICZON ID</div>
            <div className="thermal-large-id">{cleanId}</div>
          </div>

          <div className="thermal-large-details">
            <div className="thermal-large-row">
              <span className="thermal-row-label">Device:</span>
              <span className="thermal-row-value">{name || 'Unassigned Device'}</span>
            </div>
            {department && (
              <div className="thermal-large-row">
                <span className="thermal-row-label">Department:</span>
                <span className="thermal-row-value">{department}</span>
              </div>
            )}
            {custodian && (
              <div className="thermal-large-row">
                <span className="thermal-row-label">Custodian:</span>
                <span className="thermal-row-value">{custodian}</span>
              </div>
            )}
          </div>

          <div className="thermal-large-footer">
            <span>SCAN FOR HARDWARE SPECS & AUDIT LOG</span>
          </div>
        </div>
      )}

      {/* Landscape Single-Sticker Layout (3" x 2" / 4" x 3") */}
      {activeLayout === 'large-landscape' && (
        <div className="thermal-label-inner large-landscape">
          <div className="thermal-landscape-left">
            <QRCodeCanvas
              value={qrValue}
              size={260}
              level="M"
              includeMargin={false}
              style={{
                width: '38mm',
                height: '38mm',
                display: 'block',
                margin: '0 auto',
              }}
            />
          </div>
          <div className="thermal-landscape-right">
            <div className="thermal-large-brand">{brand} ASSET TAG</div>
            <div className="thermal-landscape-id">{cleanId}</div>
            <div className="thermal-landscape-details">
              <div className="thermal-landscape-row">
                <span className="thermal-row-label">Device:</span>
                <span className="thermal-row-value">{name || 'Unassigned Device'}</span>
              </div>
              {department && (
                <div className="thermal-landscape-row">
                  <span className="thermal-row-label">Dept:</span>
                  <span className="thermal-row-value">{department}</span>
                </div>
              )}
              {custodian && (
                <div className="thermal-landscape-row">
                  <span className="thermal-row-label">Custodian:</span>
                  <span className="thermal-row-value">{custodian}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Compact Side-by-Side Layout (40mm x 30mm) */}
      {activeLayout === 'side-by-side' && (
        <div className="thermal-label-inner side-by-side">
          <div className="thermal-qr-box">
            <QRCodeCanvas
              value={qrValue}
              size={180}
              level="M"
              includeMargin={false}
              style={{
                width: '23mm',
                height: '23mm',
                display: 'block',
              }}
            />
          </div>
          <div className="thermal-info-box">
            <div className="thermal-brand-badge">{brand}</div>
            <div className="thermal-id-text" title={`Miczon ID: ${cleanId}`}>
              {cleanId}
            </div>
            {name ? (
              <div className="thermal-title-text" title={name}>
                {name}
              </div>
            ) : (
              <div className="thermal-unassigned-tag">UNASSIGNED TAG</div>
            )}
            {(department || custodian) && (
              <div className="thermal-sub-text" title={`${department || ''} ${custodian ? `(${custodian})` : ''}`}>
                {department || custodian}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Compact Stacked Layout */}
      {activeLayout === 'stacked' && (
        <div className="thermal-label-inner stacked">
          <div className="thermal-top-brand">{brand} ASSET TAG</div>
          <div className="thermal-qr-box-center">
            <QRCodeCanvas
              value={qrValue}
              size={180}
              level="M"
              includeMargin={false}
              style={{
                width: '16.5mm',
                height: '16.5mm',
                display: 'block',
                margin: '0 auto',
              }}
            />
          </div>
          <div className="thermal-bottom-info">
            <div className="thermal-id-text">{cleanId}</div>
            {name ? (
              <div className="thermal-title-text" title={name}>
                {name}
              </div>
            ) : (
              <div className="thermal-unassigned-tag">UNASSIGNED TAG</div>
            )}
          </div>
        </div>
      )}

      {/* Fast Scan QR Only Layout */}
      {activeLayout === 'qr-only' && (
        <div className="thermal-label-inner qr-only">
          <div className="thermal-top-brand">{brand} PROPERTY</div>
          <div className="thermal-qr-box-large">
            <QRCodeCanvas
              value={qrValue}
              size={220}
              level="M"
              includeMargin={false}
              style={{
                width: isLarge ? '50mm' : '25mm',
                height: isLarge ? '50mm' : '25mm',
                display: 'block',
                margin: '0 auto',
              }}
            />
          </div>
          <div className="thermal-id-large">{cleanId}</div>
        </div>
      )}
    </div>
  );
}

export default ThermalAssetLabel;
