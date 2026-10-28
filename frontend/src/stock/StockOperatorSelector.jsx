import React from 'react';
import './stock-operator.css';
import { STOCK_OPERATORS } from './stockOperators.js';

export { STOCK_OPERATORS };

export function StockOperatorSelector({ onSelect, onSignOut, currentOperator = null }) {
  return (
    <div className="stock-selector-container">
      <div className="stock-selector-card-wrapper">
        <header className="stock-selector-header">
          <div className="stock-selector-brand">
            <span className="brand-mark stock-mark">ST</span>
            <div>
              <span className="stock-selector-tag">AssetZone Stock Management</span>
              <h1 className="stock-selector-title">Select Stock In-Charge</h1>
            </div>
          </div>
          <p className="stock-selector-subtitle">
            Please choose your operator profile below to unlock and access the stock app sections.
          </p>
        </header>

        <div className="stock-operator-grid">
          {STOCK_OPERATORS.map((op) => {
            const isCurrent = currentOperator === op.name;
            return (
              <div
                key={op.id}
                role="button"
                tabIndex={0}
                className={`stock-operator-card ${isCurrent ? 'selected' : ''}`}
                style={{
                  '--op-accent': op.accent,
                  '--op-bg-light': op.bgLight,
                  '--op-border-light': op.borderLight,
                }}
                onClick={() => onSelect(op.name)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(op.name);
                  }
                }}
              >
                <div
                  className="stock-operator-avatar"
                  style={{ background: op.gradient }}
                >
                  {op.initials}
                </div>

                <div className="stock-operator-info">
                  <h3 className="stock-operator-name">{op.name}</h3>
                  <span className="stock-operator-badge">{op.role}</span>
                  <p className="stock-operator-desc">{op.description}</p>
                </div>

                <div className="stock-operator-action">
                  <span>{isCurrent ? 'Current Profile' : 'Continue'}</span>
                  <svg
                    className="stock-operator-arrow"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>

        {onSignOut && (
          <footer className="stock-selector-footer">
            <button
              type="button"
              className="stock-selector-signout-btn"
              onClick={onSignOut}
            >
              ← Sign out of Stock Account
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
