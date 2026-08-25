import React from 'react';
import { Link } from 'react-router-dom';

export function Icon({ name }) {
  if (name === 'edit') {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    );
  }
  if (name === 'cross' || name === 'close' || name === 'trash') {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    );
  }
  return <span className={`app-icon app-icon-${name}`} aria-hidden="true" />;
}

export function Button({ variant = 'default', size = 'default', className = '', ...props }) {
  return <button className={`button button-${variant} button-${size} ${className}`.trim()} {...props} />;
}

export function Select({ className = '', ...props }) {
  return <select className={`select ${className}`.trim()} {...props} />;
}

export function Dialog({ open, children }) {
  if (!open) return null;
  return <div className="dialog-root">{children}</div>;
}

export function DialogContent({ className = '', children }) {
  return (
    <div className="dialog-overlay">
      <div className={`dialog-content ${className}`.trim()} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {children && <div className="header-actions">{children}</div>}
    </header>
  );
}

export function MetricCard({ label, value, to, tone = 'slate', subtext }) {
  return (
    <Link className="metric-card-link" to={to} aria-label={`Open ${label}`}>
      <section className={`metric-card ${tone}`} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span>{label}</span>
          {subtext && <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#64748b' }}>{subtext}</span>}
        </div>
        {typeof value === 'object' ? (
          value
        ) : (
          <strong>{value ?? 0}</strong>
        )}
      </section>
    </Link>
  );
}

export function DialogHeader({ title, description }) {
  return (
    <div className="dialog-header">
      <h2 className="dialog-title">{title}</h2>
      {description && <p className="dialog-description">{description}</p>}
    </div>
  );
}

export function Field({ label, className = '', children }) {
  return (
    <label className={`field ${className}`.trim()}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Notice({ children, tone = 'success' }) {
  return <div className={`notice ${tone}`}>{children}</div>;
}

export function StatusBadge({ status }) {
  const label = String(status || 'Unknown').replaceAll('_', ' ').toLowerCase();
  return <span className={`status-badge ${String(status || '').toLowerCase()}`}>{label}</span>;
}

export function DataTable({ columns, rows, empty = 'No records found.' }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="empty-state">{empty}</td></tr>
          ) : rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
