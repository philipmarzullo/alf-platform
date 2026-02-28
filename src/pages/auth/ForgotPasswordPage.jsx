import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import AlfMark from '../../components/shared/AlfMark';

export default function ForgotPasswordPage() {
  const { resetPassword, authError } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    const ok = await resetPassword(email);
    if (ok) setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-alf-dark flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <AlfMark size={64} className="mb-3" />
          <h1 className="text-xl text-white" style={{ fontFamily: 'Georgia, serif', letterSpacing: -1 }}>alf</h1>
          <p className="text-xs text-white/50 mt-1">Reset Password</p>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm px-4 py-3 rounded-lg mb-4">
              Check your email for a password reset link.
            </div>
            <Link to="/" className="text-sm text-alf-orange hover:text-alf-orange/80 transition-colors">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {authError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg">
                {authError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-alf-orange"
                placeholder="you@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-alf-orange text-white text-sm font-medium rounded-lg hover:bg-alf-orange/90 disabled:opacity-50 transition-colors"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <div className="text-center">
              <Link to="/" className="text-sm text-alf-orange hover:text-alf-orange/80 transition-colors">
                Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
