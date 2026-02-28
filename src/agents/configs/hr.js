import { SHARED_RULES } from '../prompts';

export const hrAgent = {
  name: 'HR Agent',
  department: 'hr',
  status: 'active',
  model: 'claude-sonnet-4-20250514',
  systemPrompt: `You are an HR operations assistant for a facility services company. You help HR coordinators process benefits enrollments, pay rate changes, leave of absence requests, and unemployment claims.

${SHARED_RULES}

HR-Specific Rules:
- Follow the company's SOPs exactly as documented. Do not improvise process steps.
- Generate actionable outputs: email drafts, system update instructions, compliance checklists, deadline summaries.
- Reference the company's HR systems when they appear in the knowledge base context.
- When generating system update instructions, specify: which section, which tab, which field, what value, what effective date.
- When drafting emails, use a respectful and supportive tone.`,

  knowledgeModules: [
    'Benefits Enrollment SOP',
    'Pay Rate Changes SOP',
    'Leave of Absence SOP',
    'Unemployment Claims SOP',
    'Union Pay Schedule 2026',
  ],

  actions: {
    draftReminder: {
      label: 'Draft Reminder Email',
      description: 'Generate a benefits enrollment reminder for an employee',
      promptTemplate: (data) => `Draft a benefits enrollment reminder email for ${data.employeeName}. They were hired on ${data.hireDate} and have ${data.daysRemaining} days remaining in their enrollment window. Keep it supportive and professional.`,
    },
    generateSystemUpdate: {
      label: 'Generate System Update',
      description: 'Step-by-step HR system field update instructions',
      promptTemplate: (data) => `Generate step-by-step HR system update instructions for: ${data.description}. Employee: ${data.employeeName}. Include the specific section, tab, field name, value to enter, and effective date. Be precise — HR coordinators will follow these instructions exactly.`,
    },
    checkUnionCompliance: {
      label: 'Check Union Compliance',
      description: 'Validate pay rate change against union contract',
      promptTemplate: (data) => `Check union compliance for a pay rate change: Employee ${data.employeeName}, current rate ${data.currentRate}, proposed rate ${data.proposedRate}, union: ${data.union}, effective date: ${data.effectiveDate}. Verify the proposed rate aligns with the contract schedule and flag any issues.`,
    },
    notifyOperations: {
      label: 'Notify Operations',
      description: 'Draft supervisor/VP notification for approved leave',
      promptTemplate: (data) => `Draft an operations notification for: ${data.employeeName} has been approved for ${data.leaveType} from ${data.dates}. Include what the supervisor needs to know, staffing implications, and return-to-work expectations.`,
    },
    checkEligibility: {
      label: 'Check Eligibility',
      description: 'Evaluate leave eligibility against FMLA/state criteria',
      promptTemplate: (data) => `Evaluate leave eligibility for ${data.employeeName} requesting ${data.leaveType}. Employment dates: relevant. Check against FMLA requirements (12 months employed, 1,250 hours) and applicable state leave laws. List what documentation is needed.`,
    },
    sendReminder: {
      label: 'Send Reminder',
      description: 'Draft follow-up for overdue documents',
      promptTemplate: (data) => `Draft a follow-up communication for ${data.employeeName} regarding overdue: ${data.overdueItem}. Be supportive but clear about the deadline and consequences of non-submission. Offer to help if they're having difficulty.`,
    },
    runEnrollmentAudit: {
      label: 'Run Enrollment Audit',
      description: 'Review all open enrollments and flag issues',
      promptTemplate: (data) => `Review the following open benefits enrollments and flag any issues:\n${data.enrollments.map(e => `- ${e.name}: hired ${e.hireDate}, ${e.daysRemaining} days remaining, status: ${e.status}`).join('\n')}\n\nFlag: approaching deadlines, missing steps, employees who need follow-up.`,
    },
    generateRateChangeBatch: {
      label: 'Generate Rate Change Batch',
      description: 'Produce employee list and new rates for union contract',
      promptTemplate: (data) => `Generate a rate change batch for: ${data.union}. Effective date: ${data.effectiveDate}. Current rate: ${data.currentRate}/hr. New rate: ${data.newRate}/hr. Employees affected: ${data.employeesAffected}. Produce a batch update checklist including: fields to update, effective date, any benefits or deduction impacts, and verification steps.`,
    },
    askAgent: {
      label: 'Ask HR Agent',
      description: 'Open-ended HR operations question',
      promptTemplate: (data) => data.question,
    },
  },
};
