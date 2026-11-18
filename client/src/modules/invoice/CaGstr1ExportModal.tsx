import React, { useEffect, useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  X,
  CheckCircle2,
  Table,
  Filter
} from 'lucide-react';
import { ModalBackdrop } from '../../components/ui/DismissOnOutsideClick';

interface CaGstr1ExportModalProps {
  onClose: () => void;
}

export const CaGstr1ExportModal: React.FC<CaGstr1ExportModalProps> = ({ onClose }) => {
  const [period, setPeriod] = useState<'current_month' | 'last_quarter' | 'custom'>('current_month');
  const [startDate, setStartDate] = useState<string>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [invoiceRows, setInvoiceRows] = useState<Array<Record<string, any>>>([]);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const loadPreview = async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const params = new URLSearchParams({ period, ...(period === 'custom' ? { startDate, endDate } : {}) });
        const response = await fetch(`/api/v1/invoices?${params}`, {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${sessionStorage.getItem('sharvin_token') || ''}` },
        });
        const body = await response.json();
        if (!response.ok || !body.success) throw new Error(body.error || 'Could not load invoice preview.');
        setInvoiceRows(Array.isArray(body.data) ? body.data : []);
      } catch (error) {
        if (!controller.signal.aborted) {
          setInvoiceRows([]);
          setPreviewError(error instanceof Error ? error.message : 'Could not load invoice preview.');
        }
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    };
    void loadPreview();
    return () => controller.abort();
  }, [period, startDate, endDate]);

  const handleDownload = async (format: 'csv' | 'xlsx') => {
    setLoading(true);
    setDownloadSuccess(null);
    try {
      const queryParams = new URLSearchParams({
        period,
        format: format === 'csv' ? 'json' : format,
        ...(period === 'custom' ? { startDate, endDate } : {}),
      });

      const url = `/api/v1/invoices/export/gstr-1?${queryParams.toString()}`;
      
      // Trigger native download
      const response = await fetch(url, { headers: { Authorization: `Bearer ${sessionStorage.getItem('sharvin_token') || ''}` } });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'The export could not be generated.');
      }
      let blob: Blob;
      if (format === 'csv') {
        const body = await response.json();
        if (!body.success || !Array.isArray(body.data)) throw new Error(body.error || 'The export response was invalid.');
        const columns = [
          ['Invoice No', 'invoiceNo'], ['Date', 'date'], ['Buyer GSTIN', 'buyerGstin'],
          ['Taxable Value', 'taxableValue'], ['CGST', 'cgst'], ['SGST', 'sgst'], ['IGST', 'igst'], ['Total', 'total'],
        ] as const;
        const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const csv = [
          columns.map(([label]) => escapeCsv(label)).join(','),
          ...body.data.map((row: Record<string, unknown>) => columns.map(([, key]) => escapeCsv(row[key])).join(',')),
        ].join('\r\n');
        blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
      } else {
        blob = await response.blob();
      }
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `GSTR1_B2B_Export_${period}_${new Date().toISOString().slice(0, 10)}.${format === 'xlsx' ? 'xls' : 'csv'}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setDownloadSuccess(`Successfully exported official GSTR-1 as ${format.toUpperCase()}!`);
    } catch (err: any) {
      console.error('Download error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose} className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col overflow-hidden my-auto animate-in zoom-in-95 text-slate-900 text-xs font-sans">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                CA GSTR-1 Official Excel &amp; CSV Tax Export
              </h3>
              <p className="text-[11px] text-slate-500">
                Statutory Table 4 (B2B Taxable Outward Invoices) format for Chartered Accountants &amp; GSTN Portal
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Filter Bar */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-blue-600" />
                Select Tax Filing Period
              </span>
              <span className="text-[10px] text-slate-500">FY {new Date().getFullYear()}-{String((new Date().getFullYear() + 1) % 100).padStart(2, '0')}</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPeriod('current_month')}
                className={`py-2 px-3 rounded-lg font-semibold text-xs transition border ${
                  period === 'current_month'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Current Month
              </button>
              <button
                type="button"
                onClick={() => setPeriod('last_quarter')}
                className={`py-2 px-3 rounded-lg font-semibold text-xs transition border ${
                  period === 'last_quarter'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Last Quarter
              </button>
              <button
                type="button"
                onClick={() => setPeriod('custom')}
                className={`py-2 px-3 rounded-lg font-semibold text-xs transition border ${
                  period === 'custom'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Custom Range
              </button>
            </div>

            {period === 'custom' && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 animate-in fade-in">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">From Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">To Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Table Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-600">
              <span className="font-semibold flex items-center gap-1.5">
                <Table className="w-3.5 h-3.5 text-slate-500" />
                Live Preview: GSTR-1 Table 4 (B2B Taxable Supplies)
              </span>
              <span>{previewLoading ? 'Loading invoices…' : `${invoiceRows.length} invoice${invoiceRows.length === 1 ? '' : 's'}`}</span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-56">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 text-[10px] font-semibold border-b border-slate-200">
                    <th className="py-2 px-2.5">Recipient GSTIN</th>
                    <th className="py-2 px-2.5">Trade Name</th>
                    <th className="py-2 px-2">Invoice #</th>
                    <th className="py-2 px-2">Date</th>
                    <th className="py-2 px-2 text-right">Value (₹)</th>
                    <th className="py-2 px-2 text-center">Rate</th>
                    <th className="py-2 px-2 text-right">Taxable (₹)</th>
                    <th className="py-2 px-2 text-right">CGST (₹)</th>
                    <th className="py-2 px-2 text-right">SGST (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-[11px]">
                  {invoiceRows.map((r, i) => {
                    const date = r.invoiceDate || r.issuedAt || r.createdAt;
                    const total = Number(r.totalInvoiceAmount ?? r.totalAmount ?? r.totalValue ?? 0);
                    const taxable = Number(r.taxableAmount ?? r.subtotal ?? 0);
                    return (
                      <tr key={r.id || r.invoiceNumber || i} className="hover:bg-slate-50 font-mono">
                        <td className="py-2 px-2.5 font-bold text-slate-800">{r.retailerGstin || r.buyerGstin || '—'}</td>
                        <td className="py-2 px-2.5 font-sans font-medium text-slate-900">{r.retailerName || r.buyerName || '—'}</td>
                        <td className="py-2 px-2 text-blue-700 font-bold">{r.invoiceNumber || '—'}</td>
                        <td className="py-2 px-2 text-slate-600">{date ? new Date(date).toLocaleDateString('en-IN') : '—'}</td>
                        <td className="py-2 px-2 text-right font-bold text-slate-900">{total.toFixed(2)}</td>
                        <td className="py-2 px-2 text-center text-slate-600">—</td>
                        <td className="py-2 px-2 text-right text-slate-700">{taxable.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right text-slate-700">—</td>
                        <td className="py-2 px-2 text-right text-slate-700">—</td>
                      </tr>
                    );
                  })}
                  {!previewLoading && !previewError && invoiceRows.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">No invoices found for this period.</td></tr>
                  )}
                  {previewError && <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-rose-700">{previewError}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {downloadSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{downloadSuccess}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500">
            Compatible with Tally ERP 9, Busy, ClearTax, and GST offline tool.
          </span>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => handleDownload('csv')}
              disabled={loading}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-bold transition shadow-xs disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Download .CSV</span>
            </button>
            <button
              onClick={() => handleDownload('xlsx')}
              disabled={loading}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm shadow-blue-600/20 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Download CA Excel (.xls)</span>
            </button>
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
};
