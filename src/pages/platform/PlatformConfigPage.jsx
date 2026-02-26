import { useState, useEffect } from 'react';
import { Settings, Save, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const DEFAULT_CONFIG = {
  default_model: 'claude-sonnet-4-5-20250514',
  max_tokens: 4096,
  rate_limit_per_minute: 10,
};

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-5-20250514', label: 'Claude Sonnet 4.5' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  { value: 'claude-opus-4-5-20250514', label: 'Claude Opus 4.5' },
];

export default function PlatformConfigPage() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setLoading(true);
    const { data, error: fetchErr } = await supabase
      .from('alf_platform_config')
      .select('key, value');

    if (fetchErr) {
      setError(fetchErr.message);
      setLoading(false);
      return;
    }

    const merged = { ...DEFAULT_CONFIG };
    (data || []).forEach((row) => {
      if (row.key in merged) {
        // Preserve numeric types
        const num = Number(row.value);
        merged[row.key] = isNaN(num) ? row.value : num;
      }
    });
    setConfig(merged);
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const rows = Object.entries(config).map(([key, value]) => ({
      key,
      value: String(value),
    }));

    const { error: upsertErr } = await supabase
      .from('alf_platform_config')
      .upsert(rows, { onConflict: 'key' });

    if (upsertErr) {
      setError(upsertErr.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-dark-text">Platform Configuration</h1>
          <p className="text-sm text-secondary-text mt-1">Global defaults for the Alf platform</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">
          Configuration saved successfully.
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
        {/* Default Model */}
        <div className="p-5 flex flex-col md:flex-row md:items-center gap-2 md:gap-8">
          <div className="md:w-1/3">
            <div className="text-sm font-medium text-dark-text">Default Model</div>
            <div className="text-xs text-secondary-text mt-0.5">Used when tenants don't specify a model override</div>
          </div>
          <div className="flex-1">
            <select
              value={config.default_model}
              onChange={(e) => setConfig({ ...config, default_model: e.target.value })}
              className="w-full md:w-80 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Max Tokens */}
        <div className="p-5 flex flex-col md:flex-row md:items-center gap-2 md:gap-8">
          <div className="md:w-1/3">
            <div className="text-sm font-medium text-dark-text">Max Tokens</div>
            <div className="text-xs text-secondary-text mt-0.5">Default max output tokens per request</div>
          </div>
          <div className="flex-1">
            <input
              type="number"
              value={config.max_tokens}
              onChange={(e) => setConfig({ ...config, max_tokens: parseInt(e.target.value) || 0 })}
              min={256}
              max={32768}
              className="w-full md:w-80 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Rate Limit */}
        <div className="p-5 flex flex-col md:flex-row md:items-center gap-2 md:gap-8">
          <div className="md:w-1/3">
            <div className="text-sm font-medium text-dark-text">Rate Limit</div>
            <div className="text-xs text-secondary-text mt-0.5">Max agent calls per user per minute</div>
          </div>
          <div className="flex-1">
            <input
              type="number"
              value={config.rate_limit_per_minute}
              onChange={(e) => setConfig({ ...config, rate_limit_per_minute: parseInt(e.target.value) || 0 })}
              min={1}
              max={100}
              className="w-full md:w-80 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
