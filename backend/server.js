import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import auth from './middleware/auth.js';
import claudeRouter from './routes/claude.js';
import credentialsRouter from './routes/credentials.js';
import platformCredentialsRouter from './routes/platformCredentials.js';
import sopAnalysisRouter from './routes/sopAnalysis.js';
import dashboardsRouter from './routes/dashboards.js';
import backupRouter from './routes/backup.js';
import customToolsRouter from './routes/customTools.js';

const app = express();
const PORT = process.env.PORT || 3001;

// --- CORS ---
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin(origin, cb) {
    // Allow requests with no origin (curl, server-to-server)
    if (!origin) return cb(null, true);
    // Allow any localhost port for local dev
    if (/^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS: origin not allowed'));
  },
  credentials: true,
}));

// --- Body parsing ---
app.use(express.json({ limit: '10mb' }));

// --- Health check (no auth) ---
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    anthropic_configured: !!process.env.ANTHROPIC_API_KEY,
    credential_encryption: !!process.env.CREDENTIAL_ENCRYPTION_KEY,
    supabase_configured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
  });
});

// --- Authenticated routes ---
app.use('/api/claude', auth, claudeRouter);
app.use('/api/credentials', auth, credentialsRouter);
app.use('/api/platform-credentials', auth, platformCredentialsRouter);
app.use('/api/sop-analysis', auth, sopAnalysisRouter);
app.use('/api/dashboards', auth, dashboardsRouter);
app.use('/api/backup', auth, backupRouter);
app.use('/api/custom-tools', auth, customToolsRouter);

// --- 404 ---
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// --- Error handler ---
app.use((err, req, res, _next) => {
  console.error('[server] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`[alf-platform-backend] Running on :${PORT}`);
  console.log(`  Anthropic key (env fallback): ${process.env.ANTHROPIC_API_KEY ? 'configured' : 'not set'}`);
  console.log(`  Credential encryption: ${process.env.CREDENTIAL_ENCRYPTION_KEY ? 'configured' : 'MISSING'}`);
  console.log(`  Supabase: ${process.env.SUPABASE_URL ? 'configured' : 'MISSING'}`);
  console.log(`  CORS origins: ${allowedOrigins.join(', ')}`);
});
