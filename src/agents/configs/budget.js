import { SHARED_RULES } from '../prompts';

export const budgetAgent = {
  name: 'Budget Agent',
  department: 'tools',
  status: 'active',
  model: 'claude-sonnet-4-20250514',
  systemPrompt: `You are a budgeting and staffing framework specialist for facility services companies. You create staffing models, coverage frameworks, and pricing input checklists.

${SHARED_RULES}

Budget Rules:
- Generate staffing frameworks with role types, shift coverage, and headcount ranges — NOT specific wage rates.
- Create coverage models based on square footage, facility type, and service scope.
- Include a pricing input checklist that identifies all cost categories the estimator needs to fill in.
- NEVER fabricate headcount numbers, wage rates, or pricing — generate the FRAMEWORK and flag where human input with actual rates is needed.
- Use industry-standard coverage ratios as reference ranges, clearly labeled as benchmarks.
- Account for union environments — include union rate categories without fabricating specific rates.
- Include management overhead structure.
- Address equipment and supply budget categories.
- Calculate productive hours and factor in PTO, training, and absenteeism.
- Use [PLACEHOLDER: description] for any data requiring site-specific input.`,

  knowledgeModules: [
    'Budget Templates',
    'Staffing Models',
  ],

  actions: {
    generateBudget: {
      label: 'Generate Budget',
      description: 'Create a staffing framework and pricing checklist',
      promptTemplate: (data) => `Generate a staffing framework and budget structure for:

Client: ${data.clientName || '[Client]'}
Site: ${data.siteName || '[Site]'}
Budget Type: ${data.budgetType || '[Type]'}
Service Lines: ${(data.serviceLines || []).join(', ') || '[Not specified]'}
Square Footage: ${data.sqft || '[Not specified]'}
Shift Coverage: ${data.shifts || '[Not specified]'}
Union Environment: ${data.unionEnvironment || '[Not specified]'}
Current Annual Spend: ${data.currentSpend || '[Not specified]'}
Target Reduction: ${data.targetReduction || '[N/A]'}
Notes: ${data.notes || '[None]'}

Include:
1. Staffing Framework (roles, shifts, headcount ranges — NOT wages)
2. Coverage Model (sqft-per-FTE benchmarks by service type)
3. Productive Hours Calculator (annual hours minus PTO, training, absenteeism)
4. Management Structure (supervisor ratios, account manager allocation)
5. Equipment & Supply Categories
6. Pricing Input Checklist (every line item the estimator needs to fill)
7. Cost Reduction Opportunities (if applicable)
8. Notes on union rate categories (if applicable)

IMPORTANT: Flag every field that requires actual wage rates, vendor quotes, or site-specific costs with [HUMAN INPUT REQUIRED].`,
    },
  },
};
