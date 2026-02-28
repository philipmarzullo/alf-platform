import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import AlfMark from '../../components/shared/AlfMark';

export default function ResetPasswordPage() {
  const { updatePassword, authError } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLocalError(null);

    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setLocalError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const ok = await updatePassword(password);
    if (ok) navigate('/');
    setLoading(false);
  }

  const error = localError || authError;

  return (
    <div className="min-h-screen bg-alf-dark flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <AlfMark variant="dark" size="lg" className="mb-3" />
          <p className="text-xs text-white/50">Set New Password</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-alf-orange"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-alf-orange"
              placeholder="Re-enter password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-alf-orange text-white text-sm font-medium rounded-lg hover:bg-alf-orange/90 disabled:opacity-50 transition-colors"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
