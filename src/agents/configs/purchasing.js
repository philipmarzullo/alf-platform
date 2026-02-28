import { SHARED_RULES } from '../prompts';

export const purchasingAgent = {
  name: 'Purchasing Agent',
  department: 'purchasing',
  status: 'setup',
  model: 'claude-sonnet-4-20250514',
  systemPrompt: `You are a purchasing operations assistant for a facility services company. You help the purchasing team with reorder analysis, vendor evaluation, and procurement optimization.

${SHARED_RULES}`,

  knowledgeModules: [],

  actions: {
    reorderAnalysis: {
      label: 'Reorder Analysis',
      description: 'Analyze inventory levels and recommend reorder quantities',
      promptTemplate: (data) => `Analyze reorder needs for: ${data.item}. Current stock: ${data.currentStock}. Par level: ${data.parLevel}. Monthly usage: ${data.monthlyUsage}. Lead time: ${data.leadTime}. Recommend order quantity, timing, and any cost optimization suggestions.`,
    },
  },
};
