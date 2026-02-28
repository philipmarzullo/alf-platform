import { SHARED_RULES } from '../prompts';

export const salesAgent = {
  name: 'Sales Agent',
  department: 'sales',
  status: 'active',
  model: 'claude-sonnet-4-20250514',
  systemPrompt: `You are a sales operations assistant for a facility services company. You help the sales team manage the contract renewal pipeline, analyze APC (As Per Contract) spend, and track TBI (To Be Invoiced) extra/tag work.

${SHARED_RULES}

Sales-Specific Rules:
- You have visibility into contract end dates, APC monthly/annual figures, prior year comparisons, and TBI totals.
- When analyzing renewals, focus on urgency tiers: red (<30 days), yellow (30-90 days), green (>90 days).
- When discussing APC, reference year-over-year variance and flag contracts where spend is trending above or below expectations.
- TBI represents extra/tag work outside the base contract — track pending amounts that haven't been invoiced yet.
- Frame all analysis around client retention and relationship health.
- Reference the company's operational systems when they appear in knowledge base context.
- Never fabricate contract values, dates, or client names.
- Position the company based on performance metrics, not scale.

Client Retention Best Practices:
- Regular communication beyond service issues — proactive, not reactive.
- Proactive problem identification and resolution before clients raise concerns.
- Continuous improvement and value-add identification at every touchpoint.
- Partnership approach vs. vendor relationship.
- Executive-level relationship building and maintenance.

Performance Metrics to Track:
- SLA compliance rates against agreed targets.
- Response times for service requests and escalations.
- Client satisfaction scores tracked over time.
- Staff retention and stability.
- Cost management and budget performance.`,

  knowledgeModules: [
    'Contract Renewal Pipeline',
    'APC Spend Tracking',
    'TBI Extra Work Tracking',
    'Client Retention Metrics',
  ],

  actions: {
    renewalBrief: {
      label: 'Generate Renewal Brief',
      description: 'Summarize a contract approaching renewal with key talking points',
      promptTemplate: (data) => `Generate a renewal brief for the following contract:

Client: ${data.client || '[Client]'}
Site: ${data.site || '[Site]'}
Contract End: ${data.contractEnd || '[Date]'}
Days Remaining: ${data.daysRemaining || '[N/A]'}
Annual APC: ${data.apcAnnual || '[N/A]'}
Prior Year APC: ${data.apcPriorYear || '[N/A]'}
Service Type: ${data.serviceType || '[N/A]'}
Account Manager: ${data.accountManager || '[N/A]'}
TBI YTD: ${data.tbiYtd || '[N/A]'}

Include: relationship summary, performance highlights to lead with, pricing considerations (year-over-year change), TBI value as upsell opportunity, and recommended next steps for the account manager.`,
    },
    apcVarianceAnalysis: {
      label: 'APC Variance Analysis',
      description: 'Analyze year-over-year APC changes and flag anomalies',
      promptTemplate: (data) => `Analyze APC variance for: ${data.client || '[Client]'}

Current Annual APC: ${data.apcAnnual || '[N/A]'}
Prior Year APC: ${data.apcPriorYear || '[N/A]'}
Service Type: ${data.serviceType || '[N/A]'}
Contract Period: ${data.contractStart || '[Start]'} to ${data.contractEnd || '[End]'}

Calculate the year-over-year variance percentage. Explain likely drivers (wage increases, scope changes, CPI adjustments). Flag if variance is outside the typical 2-5% range. Recommend whether a pricing discussion is needed before renewal.`,
    },
    tbiSummary: {
      label: 'TBI Summary Report',
      description: 'Summarize TBI extra work for a client with invoicing recommendations',
      promptTemplate: (data) => `Generate a TBI summary for: ${data.client || '[Client]'}

TBI YTD Invoiced: ${data.tbiYtd || '[N/A]'}
TBI Pending (uninvoiced): ${data.tbiPending || '[N/A]'}
Annual APC: ${data.apcAnnual || '[N/A]'}

Calculate TBI as a percentage of APC. Summarize the extra work volume, flag any pending amounts that need immediate invoicing, and recommend whether this TBI level suggests scope creep that should be rolled into the next contract renewal.`,
    },
    pipelineSummary: {
      label: 'Pipeline Summary',
      description: 'Generate an executive summary of the renewal pipeline',
      promptTemplate: (data) => `Generate an executive pipeline summary based on this data:

Total Active Contracts: ${data.activeCount || '[N/A]'}
Total Annual APC: ${data.totalApc || '[N/A]'}
Expiring Within 90 Days: ${data.expiringSoonCount || '[N/A]'}
In Renewal: ${data.inRenewalCount || '[N/A]'}
Total TBI Pending: ${data.totalTbiPending || '[N/A]'}

${data.expiringContracts ? `Contracts expiring soon:\n${data.expiringContracts}` : ''}

Provide: overall pipeline health assessment, priority actions for the next 30 days, risk areas, and revenue at risk from upcoming expirations.`,
    },
    askAgent: {
      label: 'Ask Sales Agent',
      description: 'Open-ended sales operations question',
      promptTemplate: (data) => data.question,
    },
  },
};
