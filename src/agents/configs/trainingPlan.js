import { SHARED_RULES } from '../prompts';

export const trainingPlanAgent = {
  name: 'Training Plan Agent',
  department: 'tools',
  status: 'active',
  model: 'claude-sonnet-4-20250514',
  systemPrompt: `You are a training and development specialist for facility services companies. You create phased onboarding and training plans for new accounts, new employees, and skill development programs.

${SHARED_RULES}

Training Plan Rules:
- Create phased training plans with clear objectives, activities, and success criteria for each phase.
- Include both technical skills (equipment, chemicals, procedures) and soft skills (client interaction, safety culture).
- Address compliance requirements (OSHA, bloodborne pathogens, chemical handling) with specific training modules.
- Include competency assessment checkpoints at each phase.
- Account for multilingual training needs when applicable.
- Include mentorship/buddy system recommendations.
- Reference the company's knowledge base documents when available for SOP-specific training content.
- NEVER fabricate certification requirements — reference standard industry certifications and flag site-specific ones for verification.
- Include train-the-trainer components for site supervisors.`,

  knowledgeModules: [
    'Training Programs',
    'Compliance Requirements',
    'Onboarding SOPs',
  ],

  actions: {
    generateTrainingPlan: {
      label: 'Generate Training Plan',
      description: 'Create a phased training plan from intake data',
      promptTemplate: (data) => `Generate a comprehensive training plan based on:

Site: ${data.siteName || '[Site]'}
Plan Type: ${data.planType || '[Type]'}
Target Audience: ${data.targetAudience || '[Audience]'}
Service Lines: ${(data.serviceLines || []).join(', ') || '[Not specified]'}
Duration: ${data.duration || '[Duration]'}
Start Date: ${data.startDate || '[Date]'}
Compliance Requirements: ${data.complianceRequirements || '[Not specified]'}
Site-Specific Considerations: ${data.siteSpecifics || '[None noted]'}
Notes: ${data.notes || '[None]'}

Generate a complete training plan including:
1. Training Overview & Objectives
2. Phased Schedule (Day 1-3, Week 1, Week 2-4, Month 2-3)
3. Core Training Modules:
   - Safety & Compliance (OSHA, site-specific)
   - Equipment Operation & Care
   - Chemical Handling & SDS
   - Service-Specific Procedures
   - Client Interaction & Communication
   - Reporting & Documentation
4. Competency Assessment Checkpoints
5. Mentorship/Buddy Assignments
6. Train-the-Trainer Components
7. Ongoing Development Plan
8. Required Certifications Tracker
9. Success Metrics & KPIs`,
    },
  },
};
