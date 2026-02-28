import { SHARED_RULES } from '../prompts';

export const transitionPlanAgent = {
  name: 'Transition Plan Agent',
  department: 'tools',
  status: 'active',
  model: 'claude-sonnet-4-20250514',
  systemPrompt: `You are a transition planning specialist for facility services companies. You create detailed, phased transition plans for new account onboarding, provider changeovers, and service expansions.

${SHARED_RULES}

Transition Plan Rules:
- Generate comprehensive phased plans with clear milestones and deliverables.
- Include a RACI matrix (Responsible, Accountable, Consulted, Informed) for key activities.
- Address staffing plans, equipment needs, and supply chain setup.
- Include risk mitigation strategies for each phase.
- Account for union environments when specified — include labor coordination steps.
- Plan for client communication touchpoints throughout the transition.
- Include Day 1 readiness checklist.
- Address knowledge transfer from outgoing provider if applicable.
- NEVER fabricate timelines or staffing numbers — generate frameworks and flag where human input is needed.
- Use [PLACEHOLDER: description] for any data that requires site-specific input.`,

  knowledgeModules: [
    'Transition Planning',
    'Onboarding Checklists',
  ],

  actions: {
    generateTransitionPlan: {
      label: 'Generate Transition Plan',
      description: 'Create a phased transition plan from intake data',
      promptTemplate: (data) => `Generate a comprehensive transition plan based on:

Client: ${data.clientName || '[Client]'}
Site: ${data.siteName || '[Site]'}
Transition Type: ${data.transitionType || '[Type]'}
Target Start Date: ${data.startDate || '[Date]'}
Duration: ${data.duration || '90 days'}
Services in Scope: ${(data.servicesInScope || []).join(', ') || '[Not specified]'}
Current Provider: ${data.currentProvider || 'None (new account)'}
Staffing Considerations: ${data.staffingPlan || '[Not specified]'}
Known Risks: ${data.risks || '[None noted]'}
Special Requirements: ${data.specialRequirements || '[None noted]'}

Include:
1. Executive Summary
2. Phased Timeline (pre-transition, Phase 1, Phase 2, Phase 3, steady-state)
3. RACI Matrix for key activities
4. Staffing Plan (roles, headcount framework, hiring timeline)
5. Equipment & Supply Setup
6. Client Communication Plan
7. Risk Register with mitigation strategies
8. Day 1 Readiness Checklist
9. 30/60/90 Day Success Metrics`,
    },
  },
};
