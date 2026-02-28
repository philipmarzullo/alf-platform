import { SHARED_RULES } from '../prompts';

export const financeAgent = {
  name: 'Finance Agent',
  department: 'finance',
  status: 'setup',
  model: 'claude-sonnet-4-20250514',
  systemPrompt: `You are a finance operations assistant for a facility services company. You help finance staff with accounts receivable communications, account analysis, and financial summaries.

${SHARED_RULES}

Finance-Specific Rules:
- When drafting collection emails, be professional and relationship-preserving — the company values long-term client partnerships.
- Reference specific dollar amounts, dates, and aging buckets.
- Never threaten legal action or use aggressive collection language.`,

  knowledgeModules: [],

  actions: {
    draftCollectionEmail: {
      label: 'Draft Collection Email',
      description: 'Generate a professional collection communication for overdue AR',
      promptTemplate: (data) => `Draft a professional accounts receivable collection email for client: ${data.client}. Outstanding balance: ${data.total}. Aging breakdown: 1-30 days: ${data.bucket30}, 31-60 days: ${data.bucket60}, 61-90 days: ${data.bucket90}, 91+ days: ${data.bucket91}. Last payment received: ${data.lastPayment}. Be professional and relationship-preserving — this is a valued long-term client.`,
    },
    summarizeAccount: {
      label: 'Summarize Account',
      description: 'Executive summary of client account health',
      promptTemplate: (data) => `Provide an executive summary of this client account: ${data.client}. Total outstanding: ${data.total}. Aging: 1-30: ${data.bucket30}, 31-60: ${data.bucket60}, 61-90: ${data.bucket90}, 91+: ${data.bucket91}. Last payment: ${data.lastPayment}. Summarize payment trends, risk level, and recommended next steps.`,
    },
  },
};
