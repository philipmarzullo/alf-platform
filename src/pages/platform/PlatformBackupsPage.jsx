import { useState, useEffect } from 'react';
import { getFreshToken } from '../../lib/supabase';
import DataTable from '../../components/shared/DataTable';
import {
  HardDrive, Download, Trash2, Loader2, AlertTriangle, CheckCircle,
  Shield, ExternalLink, FileJson,
} from 'lucide-react';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');
const SUPABASE_PROJECT_REF = 'eyizhrubtpsfrstheamb';
const SUPABASE_DASHBOARD_URL = `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/database/backups/scheduled`;

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function PlatformBackupsPage() {
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState(null);
  const [exportError, setExportError] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => { loadHistory(); }, []);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL}/api/backup/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Failed to load history (${res.status}): ${errBody}`);
      }
      const data = await res.json();
      setHistory(data);
    } catch (err) {
      console.error('[backups] History error:', err);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setExportResult(null);
    setExportError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL}/api/backup/platform/export`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Export failed');
      }
      const data = await res.json();
      setExportResult(data);
      loadHistory();
    } catch (err) {
      console.error('[backups] Export error:', err);
      setExportError(err.message);
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete(backupId) {
    setDeletingId(backupId);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL}/api/backup/history/${backupId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      setHistory((prev) => prev.filter((b) => b.id !== backupId));
    } catch (err) {
      console.error('[backups] Delete error:', err);
    } finally {
      setDeletingId(null);
    }
  }

  const columns = [
    {
      key: 'created_at',
      label: 'Date',
      render: (v) => (
        <span className="text-xs text-dark-text">
          {new Date(v).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'backup_type',
      label: 'Type',
      render: (v) => (
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
          v === 'platform'
            ? 'bg-alf-orange/15 text-alf-orange'
            : 'bg-blue-100 text-blue-800'
        }`}>
          {v}
        </span>
      ),
    },
    {
      key: 'triggered_by_name',
      label: 'Source',
      render: (v) => (
        <span className="text-xs text-secondary-text">
          {v === 'scheduled' ? 'Daily auto-export' : v || '—'}
        </span>
      ),
    },
    {
      key: 'file_size_bytes',
      label: 'Size',
      render: (v) => <span className="text-xs font-mono">{formatBytes(v)}</span>,
    },
    {
      key: 'row_count',
      label: 'Rows',
      render: (v) => <span className="text-xs font-mono">{(v || 0).toLocaleString()}</span>,
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          {row.downloadUrl && (
            <a
              href={row.downloadUrl}
              download
              className="p-1.5 text-secondary-text hover:text-dark-text transition-colors"
              title="Download"
            >
              <Download size={14} />
            </a>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(row.id); }}
            disabled={deletingId === row.id}
            className="p-1.5 text-secondary-text hover:text-red-600 transition-colors disabled:opacity-50"
            title="Delete"
          >
            {deletingId === row.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-dark-text flex items-center gap-2">
          <HardDrive size={22} />
          Backups & Exports
        </h1>
        <p className="text-sm text-secondary-text mt-1">
          Infrastructure backups and application data exports
        </p>
      </div>

      {/* ── Section 1: Infrastructure Backups ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-green-50 rounded-lg shrink-0">
            <Shield size={20} className="text-green-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-dark-text">Infrastructure Backups</h3>
            <p className="text-sm text-secondary-text mt-1">
              Managed by Supabase Pro Plan
            </p>
            <div className="mt-3 space-y-2 text-sm text-dark-text">
              <div className="flex items-center gap-2">
                <CheckCircle size={14} className="text-green-500 shrink-0" />
                Automatic daily backups — runs every 24 hours
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle size={14} className="text-green-500 shrink-0" />
                Point-in-time recovery available for the last 7 days
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle size={14} className="text-green-500 shrink-0" />
                Full database restore available through Supabase dashboard
              </div>
            </div>
            <p className="text-xs text-secondary-text mt-3">
              No action required — database backups are fully automated. For restore operations:
            </p>
            <a
              href={SUPABASE_DASHBOARD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-sm text-alf-orange hover:text-alf-orange/80 font-medium transition-colors"
            >
              Open Supabase Dashboard <ExternalLink size={13} />
            </a>
          </div>
        </div>
      </div>

      {/* ── Section 2: Application Exports ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-alf-orange/10 rounded-lg shrink-0">
              <FileJson size={20} className="text-alf-orange" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-dark-text">Application Exports</h3>
              <p className="text-sm text-secondary-text mt-1 max-w-xl">
                Export tenant configurations, agent definitions, and application-level data as JSON.
                Useful for migration, auditing, or external archival. A daily auto-export runs and retains 30 days of history.
              </p>
            </div>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-alf-orange text-white text-sm font-medium rounded-lg hover:bg-alf-orange/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {exporting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <FileJson size={16} />
                Export Platform Data
              </>
            )}
          </button>
        </div>

        {/* Success banner */}
        {exportResult && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle size={18} className="text-green-600 shrink-0 mt-0.5" />
            <div className="text-sm text-green-800">
              <p className="font-medium">Export saved successfully</p>
              <p className="mt-1">
                {exportResult.fileSizeFormatted} — {exportResult.totalRows.toLocaleString()} rows across {exportResult.tenantCount} tenant{exportResult.tenantCount !== 1 ? 's' : ''}
              </p>
              {exportResult.downloadUrl && (
                <a
                  href={exportResult.downloadUrl}
                  download
                  className="inline-flex items-center gap-1 mt-2 text-green-700 hover:text-green-900 font-medium"
                >
                  <Download size={14} /> Download export
                </a>
              )}
            </div>
          </div>
        )}

        {/* Error banner */}
        {exportError && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {exportError}
          </div>
        )}

        {/* Exclusions */}
        <div className="mt-4 bg-alf-orange/10 border border-alf-orange/30 rounded-lg p-4 flex gap-3">
          <AlertTriangle size={16} className="text-alf-orange shrink-0 mt-0.5" />
          <div className="text-xs text-alf-orange">
            <span className="font-medium">Not included:</span> API credentials (encrypted keys), Snowflake sync tables (sf_*), generated PPTX decks.
            These are not application config — use Supabase backups for full database recovery.
          </div>
        </div>
      </div>

      {/* ── Export History ── */}
      <div>
        <h3 className="text-sm font-semibold text-dark-text mb-3">Export History</h3>
        {loadingHistory ? (
          <div className="flex items-center gap-2 text-secondary-text text-sm py-8 justify-center">
            <Loader2 size={16} className="animate-spin" /> Loading history...
          </div>
        ) : history.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-secondary-text">
            No exports yet. Run a manual export or wait for the daily auto-export.
          </div>
        ) : (
          <DataTable columns={columns} data={history} />
        )}
      </div>
    </div>
  );
}
