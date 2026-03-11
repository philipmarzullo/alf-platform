import { Router } from 'express';
import multer from 'multer';
import {
  parseWinTeamExcel,
  classifyAndAggregate,
  buildJobSummary,
  generateExcelReport,
} from '../lib/unionBenefitsReport.js';

const router = Router();

// File upload: memory storage, 50MB limit, xls/xlsx only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (['xlsx', 'xls'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx and .xls files are accepted'));
    }
  },
});

// ─── Guards ─────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateTenantId(req, res, next) {
  const { tenantId } = req.params;
  if (!tenantId || !UUID_RE.test(tenantId)) {
    return res.status(400).json({ error: 'Invalid tenant ID format' });
  }
  next();
}

function requireTenantAccess(req, res, next) {
  const role = req.user?.role;
  const userTenantId = req.user?.tenant_id;
  const targetTenantId = req.params.tenantId;

  if (role === 'platform_owner') return next();
  if (userTenantId === targetTenantId) return next();

  return res.status(403).json({ error: 'Access denied' });
}

router.param('tenantId', validateTenantId);

// ─── GET /:tenantId/unions — list active union configs ──────────────────

router.get('/:tenantId/unions', requireTenantAccess, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('tenant_union_configs')
      .select('id, union_key, union_name, trust_name, hw_rate, pension_rate')
      .eq('tenant_id', req.params.tenantId)
      .eq('is_active', true)
      .order('union_name');

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[union-benefits] List unions error:', err.message);
    res.status(500).json({ error: 'Failed to list union configs' });
  }
});

// ─── POST /:tenantId/generate — generate union benefits report ──────────

router.post(
  '/:tenantId/generate',
  requireTenantAccess,
  upload.single('timekeeping_file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No timekeeping file uploaded' });
    }

    const { union_key, report_month, notes } = req.body;
    if (!union_key) {
      return res.status(400).json({ error: 'union_key is required' });
    }
    if (!report_month || !/^\d{4}-\d{2}$/.test(report_month)) {
      return res.status(400).json({ error: 'report_month is required (YYYY-MM format)' });
    }

    const tenantId = req.params.tenantId;

    try {
      // 1. Load union config
      const { data: unionConfig, error: cfgErr } = await req.supabase
        .from('tenant_union_configs')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('union_key', union_key)
        .eq('is_active', true)
        .single();

      if (cfgErr || !unionConfig) {
        return res.status(404).json({ error: `Union config not found: ${union_key}` });
      }

      // 2. Parse WinTeam file
      const { colMap, rows } = parseWinTeamExcel(req.file.buffer);

      // 3. Classify and aggregate
      const { employees, warnings } = classifyAndAggregate(rows, colMap, unionConfig);

      if (employees.length === 0) {
        return res.status(400).json({
          error: 'No employees found in file. Check that the employee type filter matches.',
        });
      }

      // 4. Build job summary
      const jobSummary = buildJobSummary(employees);

      // 5. Generate Excel
      const excelBuffer = await generateExcelReport(employees, jobSummary, unionConfig, report_month);

      // 6. Build summary
      const totalReg = employees.reduce((s, e) => s + e.regHours, 0);
      const totalVac = employees.reduce((s, e) => s + e.vacHours, 0);
      const hwRate = parseFloat(unionConfig.hw_rate);
      const pensionRate = parseFloat(unionConfig.pension_rate);

      const summary = {
        employeeCount: employees.length,
        jobCount: jobSummary.length,
        totalRegHours: Math.round(totalReg * 100) / 100,
        totalVacHours: Math.round(totalVac * 100) / 100,
        estimatedHW: Math.round(totalReg * hwRate * 100) / 100,
        estimatedPension: Math.round((totalReg + totalVac) * pensionRate * 100) / 100,
        hwRate,
        pensionRate,
        unionName: unionConfig.union_name,
        trustName: unionConfig.trust_name,
      };

      // 7. Log to tool_submissions
      try {
        await req.supabase.from('tool_submissions').insert({
          tenant_id: tenantId,
          tool_key: 'union-benefits-report',
          user_id: req.user.id,
          input_summary: {
            union_key,
            report_month,
            source_file: req.file.originalname,
            employee_count: employees.length,
            notes: notes || null,
          },
          output_summary: summary,
          status: 'completed',
        });
      } catch (logErr) {
        console.error('[union-benefits] Failed to log submission:', logErr.message);
        // Don't fail the request for a logging error
      }

      // 8. Respond
      const [yr, mo] = report_month.split('-');
      const monthName = new Date(parseInt(yr), parseInt(mo) - 1, 1)
        .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const filename = `Union_Benefits_${unionConfig.union_name.replace(/\s+/g, '_')}_${report_month}.xlsx`;

      res.json({
        summary,
        warnings,
        file: {
          base64: Buffer.from(excelBuffer).toString('base64'),
          filename,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
    } catch (err) {
      console.error('[union-benefits] Generate error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to generate report' });
    }
  }
);

export default router;
