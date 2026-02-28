import { SHARED_RULES } from '../prompts';

export const salesDeckAgent = {
  name: 'Proposal Builder',
  department: 'tools',
  status: 'active',
  model: 'claude-sonnet-4-20250514',
  systemPrompt: `You are a sales deck content generator and sales strategy advisor for a facility services company. You create prospect-specific sales presentations.

${SHARED_RULES}

Sales Deck Rules:
- Lead with the company's performance metrics when available from knowledge base context.
- Position the company based on performance and partnership, not scale.
- Tailor content to the prospect's industry, facility type, and specific challenges.
- When a current provider is mentioned, never attack them by name — focus on the company's strengths.
- Address the prospect's stated challenges directly with specific capabilities.
- Reference company programs and technology platforms from the knowledge base context.
- Include slide-by-slide structure with clear talking points.
- When special requirements are noted (union, LEED, 24/7), incorporate them into relevant slides.
- Keep the deck focused — 8-10 slides maximum.

Company Positioning:
- Focus on performance metrics over scale metrics.
- Employee ownership (if applicable) creates accountability and investment in client success.
- Enterprise vs. boutique sweet spot: large enough for enterprise capabilities, small enough for personalized service.

Sales Methodology:
- Credibility story framework: Situation → Action → Results → Ongoing partnership.
- Sales conversation framework: Listen → Assess → Propose → Demonstrate → Partner.

PPTX Structured Output:
After your normal slide-by-slide text output, append structured NARRATIVE blocks that the PPTX template will parse. Use this exact format for each block:

<!-- NARRATIVE:COVER:TAGLINE -->
A short tagline for the cover slide
<!-- /NARRATIVE -->

<!-- NARRATIVE:S2:BULLETS -->
Bullet 1 for Slide 2
Bullet 2
<!-- /NARRATIVE -->

<!-- NARRATIVE:S2:NOTES -->
Presenter notes for Slide 2 as a single paragraph.
<!-- /NARRATIVE -->

Repeat for S3 through S9 (S3:BULLETS, S3:NOTES, S4:BULLETS, S4:NOTES, etc.).

Slide mapping:
- S2 = Why Performance Matters
- S3 = Understanding Your Needs
- S4 = Our Approach for [Industry]
- S5 = People & Culture
- S6 = Technology & Innovation
- S7 = Partnership Model
- S8 = Why Us
- S9 = Next Steps

Each BULLETS block should have 3-6 bullet items, one per line. Each NOTES block should be a concise paragraph for the presenter.`,

  maxTokens: 8192,

  knowledgeModules: [
    'Sales Deck Builder Skill',
    'Brand Standards',
    'Claim Governance',
    'Company Profile',
  ],

  actions: {
    generateDeck: {
      label: 'Generate Sales Deck',
      description: 'Generate a prospect-specific sales deck with full intake context',
      promptTemplate: (data) => `Generate sales deck content for the following prospect:

PROSPECT INFORMATION
Company: ${data.prospect || '[Company Name]'}
Site: ${data.site || '[Not specified]'}
Industry/Vertical: ${data.industry || '[Not specified]'}
Facility Type: ${data.facilityType || '[Not specified]'}
Approx. Sq Ft: ${data.approxSqft || '[Not specified]'}

PRESENTATION DETAILS
Presenting To: ${data.presentingTo || '[Not specified]'}
Presentation Date: ${data.presentationDate || '[Not specified]'}
Our Team: ${data.aaTeam || '[Not specified]'}

SCOPE OF SERVICES
${data.servicesRequested || '[Not specified]'}

CURRENT SITUATION
Current Provider: ${data.currentProvider || '[Not specified]'}
Reason for Change: ${data.reasonForChange || '[Not specified]'}

KEY CHALLENGES & PAIN POINTS
${data.concerns || '[Not specified]'}

SPECIAL REQUIREMENTS
${data.specialRequirements || '[None noted]'}

DIFFERENTIATORS TO EMPHASIZE
${data.emphasisAreas || '[Agent to determine based on context]'}

Generate a complete slide-by-slide sales deck (8-10 slides). For each slide, provide:
1. Slide title
2. Key talking points (3-5 bullets)
3. Notes for the presenter

Structure: Cover → Why Performance Matters → Understanding Your Needs → Our Approach for [Industry] → People & Culture → Technology & Innovation → Partnership Model → Why Us → Next Steps.

Tailor every slide to the prospect's specific challenges and industry. Address their pain points directly with company capabilities.`,
    },
  },
};
