import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

export function buildReportPdf(title, headers, rows, subtitle = '') {
  const document = new jsPDF({ orientation: 'landscape' });
  document.setFontSize(16);
  document.text(title, 14, 16);
  document.setFontSize(10);
  document.text(subtitle, 14, 23);
  autoTable(document, {
    head: [headers], body: rows, startY: 29,
    styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 118, 110] },
    margin: { top: 15, bottom: 15 },
    didDrawPage: ({ pageNumber }) => document.text(`Page ${pageNumber}`, 270, 200),
  });
  return document;
}
