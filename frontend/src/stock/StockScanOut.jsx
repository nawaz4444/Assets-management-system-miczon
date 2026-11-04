import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { StockOperatorContext } from '../lib/contexts';
import { apiError } from '../lib/api';
import { Button, Dialog, DialogContent, DialogHeader, Field, Notice, PageHeader } from '../components/ui';

export function stockQrPayload(token) {
  return `${window.location.origin}/stock/scan/${encodeURIComponent(token || '')}`;
}

const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Printable QR label for a product
// ---------------------------------------------------------------------------
export function ProductQrDialog({ product, onClose }) {
  if (!product) return null;
  const payload = stockQrPayload(product.qr_token);

  const printLabel = () => {
    const canvas = document.querySelector('#stock-qr-canvas canvas');
    const dataUrl = canvas ? canvas.toDataURL('image/png') : '';
    const w = window.open('', '_blank', 'width=420,height=460');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${product.code}</title></head>
      <body style="margin:0;text-align:center;font-family:Arial,sans-serif" onload="window.focus();window.print();">
        <div style="padding:16px">
          <img src="${dataUrl}" style="width:220px;height:220px" alt="QR" />
          <div style="font-weight:700;font-size:16px;margin-top:8px">${product.name}</div>
          <div style="font-family:monospace;color:#475569">${product.code}</div>
        </div>
      </body></html>`);
    w.document.close();
  };

  return (
    <Dialog open={!!product}>
      <DialogContent className="dialog-sm">
        <DialogHeader title="Product QR" description="Scan this at stock-out." onClose={onClose} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div id="stock-qr-canvas" style={{ padding: '10px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <QRCodeCanvas value={payload} size={200} includeMargin />
          </div>
          <strong style={{ fontSize: '16px' }}>{product.name}</strong>
          <span style={{ fontFamily: 'monospace', color: '#475569' }}>{product.code}</span>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>
            <Button type="button" onClick={printLabel}>Print label</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Scan-to-stock-out: scan several into a cart, then submit as one batch
// ---------------------------------------------------------------------------
export function StockScanOut({ api }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const operatorCtx = useContext(StockOperatorContext);
  const operator = operatorCtx?.operator;

  const [cart, setCart] = useState([]);
  const [manual, setManual] = useState('');
  const [date, setDate] = useState(today());
  const [demandBy, setDemandBy] = useState('');
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef(null);
  const manualRef = useRef(null);

  const resolve = useCallback(async (value) => {
    const q = (value || '').trim();
    if (!q) return;
    try {
      const res = await api.get(`/stock/products/resolve/?q=${encodeURIComponent(q)}`);
      const p = res.data;
      setCart((cur) => {
        // Already scanned → leave its quantity alone (the user types the amount).
        if (cur.some((c) => c.id === p.id)) {
          setNotice(`${p.name} is already in the list — set its quantity below.`);
          return cur;
        }
        setNotice('');
        return [...cur, { id: p.id, code: p.code, name: p.name, available: p.qty, qty: 1, purpose: '' }];
      });
    } catch (err) {
      setNotice(apiError(err, 'No product matches that code.'));
    }
  }, [api]);

  // A product scanned on a phone opens /stock/scan/:token which redirects here
  // with ?add=<token>; pick it up and drop it into the cart.
  useEffect(() => {
    const add = searchParams.get('add');
    if (add) {
      resolve(add);
      searchParams.delete('add');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, resolve]);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try { await scanner.stop(); } catch { /* already stopped */ }
    try { await scanner.clear(); } catch { /* already cleared */ }
    scannerRef.current = null;
    setIsScanning(false);
  }, []);

  useEffect(() => () => { stopScanner(); }, [stopScanner]);

  const startScanner = async () => {
    setNotice('');
    await stopScanner();
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('stock-scanner-reader');
      scannerRef.current = scanner;
      setIsScanning(true);
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded) => resolve(decoded),
      );
    } catch (error) {
      setIsScanning(false);
      scannerRef.current = null;
      setNotice(error?.message || 'Unable to start camera scanner.');
    }
  };

  const setQty = (id, qty) => setCart((cur) => cur.map((c) => c.id === id ? { ...c, qty: Math.max(1, Number(qty) || 1) } : c));
  const setPurpose = (id, purpose) => setCart((cur) => cur.map((c) => c.id === id ? { ...c, purpose } : c));
  const removeItem = (id) => setCart((cur) => cur.filter((c) => c.id !== id));

  const submit = async () => {
    if (cart.length === 0) return;
    setWorking(true);
    try {
      await api.post('/stock/transactions/bulk_out/', {
        date,
        demand_by: demandBy.trim() || operator?.name || 'QR stock-out',
        transactions: cart.map((c) => ({ product_code: c.code, qty: c.qty, unit: 'pieces', purpose: c.purpose || '' })),
      });
      setNotice('Stock-out registered.'); setCart([]); setDemandBy('');
    } catch (err) {
      setNotice(apiError(err, 'Unable to register stock-out.'));
    } finally { setWorking(false); }
  };

  return (
    <>
      <PageHeader eyebrow="Stock" title="Stock Out — Scan" />
      {notice && <Notice tone={(notice.includes('Unable') || notice.includes('No product')) ? 'error' : 'success'}>{notice}</Notice>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 320px) minmax(0, 1fr)', gap: '20px', alignItems: 'start' }}>
        <section style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', background: '#fff' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: '15px' }}>Scan</h3>
          <div id="stock-scanner-reader" style={{ width: '100%', minHeight: isScanning ? '220px' : '0' }} />
          <div style={{ display: 'flex', gap: '8px', margin: '10px 0' }}>
            <Button type="button" onClick={startScanner} disabled={isScanning}>Start camera</Button>
            <Button type="button" variant="ghost" onClick={stopScanner} disabled={!isScanning}>Stop</Button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); resolve(manual); setManual(''); manualRef.current?.focus(); }}>
            <Field label="Scan with handheld, or type a code">
              <input ref={manualRef} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Scan QR / enter product code" autoFocus />
            </Field>
            <Button type="submit" variant="outline">Add</Button>
          </form>
          <p style={{ fontSize: '12px', color: '#64748b', marginTop: '10px' }}>A handheld scanner types into the box above and adds on Enter.</p>
        </section>

        <section style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '15px' }}>Items to stock out ({cart.length})</h3>
            {operator?.name && <span style={{ fontSize: '12px', color: '#64748b' }}>Operator: {operator.name}</span>}
          </div>

          {cart.length === 0 ? (
            <div style={{ padding: '24px', color: '#64748b', fontSize: '14px', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>Scan a product QR to add it here.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Product</th><th>Available</th><th>Qty out</th><th>Purpose</th><th /></tr></thead>
                <tbody>
                  {cart.map((c) => (
                    <tr key={c.id}>
                      <td><strong>{c.name}</strong><div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94a3b8' }}>{c.code}</div></td>
                      <td style={{ color: c.qty > c.available ? '#dc2626' : '#334155' }}>{c.available}</td>
                      <td><input type="number" min="1" value={c.qty} onChange={(e) => setQty(c.id, e.target.value)} style={{ width: '72px' }} /></td>
                      <td><input value={c.purpose} onChange={(e) => setPurpose(c.id, e.target.value)} placeholder="optional" style={{ width: '140px' }} /></td>
                      <td><Button type="button" variant="ghost" size="sm" onClick={() => removeItem(c.id)}>Remove</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '14px' }}>
            <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Demand by (optional)"><input value={demandBy} onChange={(e) => setDemandBy(e.target.value)} placeholder="Name / department" /></Field>
          </div>
          {cart.some((c) => c.qty > c.available) && (
            <p style={{ fontSize: '12.5px', color: '#b45309', margin: '6px 0 0' }}>Some quantities exceed what's in stock — this will take those items negative.</p>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
            <Button type="button" variant="outline" onClick={() => setCart([])} disabled={cart.length === 0}>Clear</Button>
            <Button type="button" onClick={submit} disabled={working || cart.length === 0}>{working ? 'Submitting…' : `Stock out ${cart.length} item(s)`}</Button>
          </div>
        </section>
      </div>
    </>
  );
}

// A phone scanning the QR lands here; forward into the scan-out cart.
export function StockScanRedirect() {
  const { token } = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`/stock/scan-out?add=${encodeURIComponent(token || '')}`, { replace: true });
  }, [token, navigate]);
  return <div style={{ padding: '24px', color: '#64748b' }}>Opening stock-out…</div>;
}

export default StockScanOut;
