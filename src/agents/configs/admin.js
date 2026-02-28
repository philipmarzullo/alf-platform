import { SHARED_RULES } from '../prompts';

export const adminAgent = {
  name: 'Admin Agent',
  department: 'admin',
  status: 'active',
  model: 'claude-sonnet-4-20250514',
  systemPrompt: `You are a strategic operations advisor for a facility services company, thinking from the perspective of the CEO. You have visibility across all departments — HR, Finance, Purchasing, Sales, and Operations.

${SHARED_RULES}

Admin-Specific Rules:
- Think strategically — connect dots across departments.
- Focus on: revenue retention, operational efficiency, workforce stability, client satisfaction.
- Reference the company's performance metrics and programs from knowledge base context.
- When analyzing cross-department data, surface risks and opportunities.
- Frame recommendations in terms of business impact.
- HR context: benefits enrollment, leave management, rate changes, pay rate approvals.
- Finance context: AR aging, collections, budget variance.
- Sales context: contract renewals, APC tracking, TBI pending amounts.
- Operations context: VP performance KPIs, inspection rates, deficiency tracking, incidents.
- Purchasing context: reorder alerts, vendor management, inventory levels.
- Reference the company's operational systems when they appear in knowledge base context.
- Never fabricate data — if cross-department data isn't available, say what's missing.`,

  knowledgeModules: [
    'Cross-Department Summary',
    'Client Retention Metrics',
    'Revenue & APC Pipeline',
    'Workforce KPIs',
  ],

  actions: {
    executiveBriefing: {
      label: 'Executive Briefing',
      description: 'Generate a cross-department executive summary',
      promptTemplate: (data) => `Generate an executive briefing based on the following cross-department data:

HR: ${data.hrSummary || '[HR summary data]'}
Finance: ${data.financeSummary || '[Finance summary data]'}
Sales: ${data.salesSummary || '[Sales summary data]'}
Operations: ${data.opsSummary || '[Operations summary data]'}
Purchasing: ${data.purchasingSummary || '[Purchasing summary data]'}

Provide: top 3 priorities this week, cross-department risks, opportunities for improvement, and recommended executive actions. Frame everything in terms of client retention and operational excellence.`,
    },
    crossModuleAnalysis: {
      label: 'Cross-Module Analysis',
      description: 'Analyze connections between department metrics',
      promptTemplate: (data) => `Analyze the relationship between these department metrics and surface insights:

${data.analysisContext || '[Cross-module data]'}

Look for: correlated trends, cause-and-effect relationships between departments, early warning signals, and strategic opportunities. For example: rising AR aging + upcoming contract renewals = retention risk.`,
    },
    askAgent: {
      label: 'Ask Admin Agent',
      description: 'Open-ended strategic question',
      promptTemplate: (data) => data.question,
    },
  },
};
