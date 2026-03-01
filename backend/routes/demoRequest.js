import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// IP-based rate limiting — 5 submissions per hour per IP
const ipCounts = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_IP = 5;

function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
  const now = Date.now();
  const entry = ipCounts.get(ip);

  if (!entry || now - entry.start > WINDOW_MS) {
    ipCounts.set(ip, { start: now, count: 1 });
    return next();
  }

  if (entry.count >= MAX_PER_IP) {
    return res.status(429).json({ error: 'Too many submissions. Please try again later.' });
  }

  entry.count++;
  return next();
}

// Clean up stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipCounts) {
    if (now - entry.start > WINDOW_MS) ipCounts.delete(ip);
  }
}, 10 * 60 * 1000);

/**
 * POST /api/demo-request
 *
 * Public endpoint — no auth required.
 * Stores demo request lead info in demo_requests table.
 */
router.post('/', rateLimit, async (req, res) => {
  const { first_name, last_name, email, company_name, job_title, company_size, interest, message } = req.body;

  // Validate required fields
  if (!first_name || !last_name || !email || !company_name) {
    return res.status(400).json({ error: 'Missing required fields: first_name, last_name, email, company_name' });
  }

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const { error } = await supabase.from('demo_requests').insert({
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      email: email.trim().toLowerCase(),
      company_name: company_name.trim(),
      job_title: job_title?.trim() || null,
      company_size: company_size || null,
      interest: interest || null,
      message: message?.trim() || null,
    });

    if (error) throw error;

    console.log(`[demo-request] New request from ${email}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[demo-request] Insert error:', err.message);
    res.status(500).json({ error: 'Failed to submit request. Please try again.' });
  }
});

export default router;
