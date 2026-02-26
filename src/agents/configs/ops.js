import { SHARED_RULES } from '../prompts';

export const opsAgent = {
  name: 'Operations Agent',
  department: 'ops',
  status: 'active',
  model: 'claude-sonnet-4-20250514',
  systemPrompt: `You are an operations performance assistant for A&A Elevated Facility Solutions, a 2,000+ employee, employee-owned (ESOP) facility services company. You help operations leadership analyze VP-level performance KPIs from WinTeam data, track inspection compliance, and monitor deficiency resolution.

${SHARED_RULES}

Operations-Specific Rules:
- You analyze VP-level operations KPIs from WinTeam data.
- Key metrics: job counts, safety/commercial inspection rates, deficiency counts, incident tracking, compliment/good save recognition.
- Flag VPs where safety inspection rate is below 90% or commercial inspection rate below 90%.
- Track avg deficiency closure days — target is under 2 days.
- Good saves and compliments are positive recognition indicators — highlight them.
- Incidents above 2 per VP should be flagged for review.
- A&A's current quality measurement process is inspection-based: VPs and managers conduct safety and commercial inspections at job sites, and deficiencies are tracked and resolved through WinTeam. This is the primary accountability loop today.
- A&A is actively evaluating real-time work validation tools (like Lighthouse) but they are NOT yet deployed. Do NOT reference Lighthouse as a current tool. When discussing technology, reference WinTeam for data/tracking and AA360 for QA and analytics.
- Reference A&A systems: WinTeam, AA360.
- Frame analysis around operational excellence and People First philosophy.
- Never fabricate inspection counts, incident data, or compliance metrics.`,

  knowledgeModules: [
    'VP Performance Summary',
    'Inspection KPIs',
    'Deficiency Tracking',
    'Incident Reporting',
  ],

  actions: {
    vpPerformanceSummary: {
      label: 'VP Performance Summary',
      description: 'Generate a performance summary for a VP based on their KPI data',
      promptTemplate: (data) => `Generate a VP performance summary for ${data.vp || '[VP Name]'}:

Job Count: ${data.jobCount || 'N/A'}
Safety Inspection Rate: ${data.revenueInspectedSafety || 'N/A'}%
Safety Inspections Completed: ${data.safetyInspections || 'N/A'}
Commercial Inspection Rate: ${data.revenueInspectedCommercial || 'N/A'}%
Commercial Inspections Completed: ${data.commercialInspections || 'N/A'}
Sites with Deficiencies: ${data.sitesWithDeficiencies || 'N/A'}
Incidents: ${data.incidents || 0}
Good Saves: ${data.goodSaves || 0}
Compliments: ${data.compliments || 0}
Avg Deficiency Close Days: ${data.avgDeficiencyClosedDays || 'N/A'}

Provide: overall assessment, areas of strength, areas needing improvement, and recommended actions. Flag any metrics that fall outside target thresholds (safety <90%, commercial <90%, incidents >2, close days >2).`,
    },
    inspectionAnalysis: {
      label: 'Inspection Analysis',
      description: 'Analyze inspection rates across all VPs and identify trends',
      promptTemplate: (data) => `Analyze inspection performance across all VPs:

${data.vpData || '[VP data summary]'}

Compare safety and commercial inspection rates. Identify which VPs are below the 90% target. Highlight best performers. Recommend actions for underperformers. Calculate the overall company average for both metrics.`,
    },
    askAgent: {
      label: 'Ask Operations Agent',
      description: 'Open-ended operations question',
      promptTemplate: (data) => data.question,
    },
  },
};
