import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import auth from './middleware/auth.js';
import claudeRouter from './routes/claude.js';
import credentialsRouter from './routes/credentials.js';
import platformCredentialsRouter from './routes/platformCredentials.js';
import sopAnalysisRouter from './routes/sopAnalysis.js';
import dashboardsRouter from './routes/dashboards.js';
import backupRouter, { handleScheduledExport } from './routes/backup.js';
import { handleScheduledWorkflows } from './routes/scheduledRuns.js';
import { handleMetricTriggers } from './routes/metricTriggers.js';
import customToolsRouter from './routes/customTools.js';
import syncRouter from './routes/sync.js';
import oauthRouter from './routes/oauth.js';
import automationPreferencesRouter from './routes/automationPreferences.js';
import companyProfileRouter from './routes/companyProfile.js';
import tenantWorkspacesRouter from './routes/tenantWorkspaces.js';
import tenantToolsRouter from './routes/tenantTools.js';
import tenantDashboardDomainsRouter from './routes/tenantDashboardDomains.js';
import tenantPortalRouter from './routes/tenantPortal.js';
import salesChatRouter from './routes/salesChat.js';
import demoRequestRouter from './routes/demoRequest.js';
import memoryRouter from './routes/memory.js';
import subscriptionRouter from './routes/subscription.js';
import demoResetRouter from './routes/demoReset.js';
import metricsRouter from './routes/metrics.js';
import sopAssignmentsRouter from './routes/sopAssignments.js';
import userTasksRouter from './routes/userTasks.js';
import platformUsersRouter from './routes/platformUsers.js';
import connectionsRouter from './routes/connections.js';
import integrationsRouter from './routes/integrations.js';
import embeddingsRouter from './routes/embeddings.js';
import workflowRunsRouter from './routes/workflowRuns.js';
import qbrTemplatesRouter from './routes/qbrTemplates.js';
import { createClient } from '@supabase/supabase-js';

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
app.get('/health', async (req, res) => {
  const checks = {
    server: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };

  // Deep check: actually query Supabase
  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const start = Date.now();
    const { error } = await sb.from('alf_platform_config').select('key').limit(1);
    checks.supabase = error ? 'error' : 'ok';
    checks.supabase_latency_ms = Date.now() - start;
    if (error) checks.supabase_error = error.message;
  } catch (err) {
    checks.supabase = 'error';
    checks.supabase_error = err.message;
  }

  const healthy = checks.supabase === 'ok';
  res.status(healthy ? 200 : 503).json({ status: healthy ? 'healthy' : 'degraded', ...checks });
});

// --- OAuth routes (no global auth — handled per-endpoint inside router) ---
app.use('/api/oauth', oauthRouter);

// --- Scheduled cron routes (no auth — protected by CRON_SECRET) ---
app.post('/api/backup/cron/daily-export', handleScheduledExport);
app.post('/api/workflows/cron/execute', handleScheduledWorkflows);
app.post('/api/workflows/cron/metric-triggers', handleMetricTriggers);

// --- Public API routes (no auth) ---
app.use('/api/demo-request', demoRequestRouter);
app.use('/api/sales-chat', salesChatRouter);

// --- Authenticated routes ---
app.use('/api/claude', auth, claudeRouter);
app.use('/api/credentials', auth, credentialsRouter);
app.use('/api/platform-credentials', auth, platformCredentialsRouter);
app.use('/api/sop-analysis', auth, sopAnalysisRouter);
app.use('/api/dashboards', auth, dashboardsRouter);
app.use('/api/backup', auth, backupRouter);
app.use('/api/custom-tools', auth, customToolsRouter);
app.use('/api/sync', auth, syncRouter);
app.use('/api/automation-preferences', auth, automationPreferencesRouter);
app.use('/api/company-profile', auth, companyProfileRouter);
app.use('/api/tenant-workspaces', auth, tenantWorkspacesRouter);
app.use('/api/tenant-tools', auth, tenantToolsRouter);
app.use('/api/tenant-dashboard-domains', auth, tenantDashboardDomainsRouter);
app.use('/api/tenant-portal', auth, tenantPortalRouter);
app.use('/api/memory', auth, memoryRouter);
app.use('/api/subscription', auth, subscriptionRouter);
app.use('/api/tenants', auth, demoResetRouter);
app.use('/api/metrics', auth, metricsRouter);
app.use('/api/sop-assignments', auth, sopAssignmentsRouter);
app.use('/api/user-tasks', auth, userTasksRouter);
app.use('/api/platform-users', auth, platformUsersRouter);
app.use('/api/connections', auth, connectionsRouter);
app.use('/api/integrations', auth, integrationsRouter);
app.use('/api/embeddings', auth, embeddingsRouter);
app.use('/api/workflow-runs', auth, workflowRunsRouter);
app.use('/api/qbr-templates', auth, qbrTemplatesRouter);

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
