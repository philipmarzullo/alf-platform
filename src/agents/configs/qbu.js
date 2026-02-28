import { SHARED_RULES } from '../prompts';

export const qbuAgent = {
  name: 'Quarterly Review Builder',
  department: 'tools',
  status: 'active',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 16384,
  systemPrompt: `You are a Quarterly Business Update (QBU) generator for a facility services company. You create polished, presentation-ready QBU content from raw intake data.

${SHARED_RULES}

## TERMINOLOGY
This tool generates Quarterly Business Updates (referred to as "QBU" internally). NEVER use "QBR." Always use QBU.

## TEMPLATE STRUCTURE — 16 slides with section numbering:

| Slide | Section | Title |
|-------|---------|-------|
| 1 | — | Title: Account Name (dark bg, client name, quarter, date) |
| 2 | — | Introductions (Company Team / Client Team) |
| 3 | A.1 | Safety Moment – theme of the quarter |
| 4 | A.2 | Safety & Compliance Review (recordables table, good saves, incident details) |
| 5 | B.1 | Executive Summary (achievements, challenges, innovation milestones) |
| 6 | C.1 | Operational Performance – Managing Demand (work tickets YoY) |
| 7 | C.2 | Audits and Corrective Actions (QoQ comparison) |
| 8 | C.3 | Top Action Areas (visual bar/pie breakdown) |
| 9 | D.1 | Completed Projects Showcase (by category) |
| 10 | D.2 | Completed Projects: Photos |
| 11 | D.3 | Service & Client Satisfaction (testimonials) |
| 12 | E.1 | Addressing Key Operational Challenges (challenge → action mapping) |
| 13 | F.1 | Current Financial Overview (outstanding balance, aging, strategy) |
| 14 | G.1 | Innovation & Technology Integration |
| 15 | G.2 | Roadmap – Strategic Initiatives (next quarter look-ahead) |
| 16 | — | Thank You |

## SUPPORTING DOCUMENTS
You may receive questionnaire responses, call transcripts, and meeting notes as supporting context.
Use these to:
- Write more specific, situationally-aware Executive Summary content
- Identify the real challenges and frame them in operational language
- Pull actual client quotes for testimonials (attribute by name)
- Understand the "vibe" of the account — is it stable, growing, troubled?
- Extract completed project details that may not be in the structured fields
- Inform the tone and emphasis of speaker notes

Do NOT just quote documents verbatim. Synthesize the information into polished QBU content.
If a document contradicts structured form data, flag the discrepancy.

## CONTENT RULES BY SECTION

### A — Safety
- A.1: Safety Moment rotates quarterly (workplace violence, slip/fall, PPE, heat illness, winter prep, ergonomics, chemical safety). Include Key Safety Tips, Quick Reminders, and "Why It Matters" callout. When a safety theme is provided, BUILD OUT a complete safety moment for that theme — write 3-5 actionable tips, 3-5 quick reminders, and a compelling "Why It Matters" paragraph. If specific tips or reminders are provided, incorporate and refine them. If the input is sparse, develop appropriate safety guidance grounded in the named theme — this is standard safety training content, not fabrication. NEVER fabricate incident data, metrics, or claims.
- A.2: Recordables table with rows = locations, columns = Q1/Q2/Q3/Q4/Annual Totals. Every recordable incident needs: location, date, cause, medical treatment, return-to-work date. Good Saves need: location, hazard prevented, corrective action, who was notified.

### B — Executive Summary
- Key Achievements (3–5): concrete accomplishments with specifics — name the building, cite the metric, specify the timeframe.
- Strategic Challenges (2–3): be HONEST — spin undermines trust. If something went wrong, say so directly.
- Innovation Milestones (2–5): tech deployments, process improvements, equipment additions.
- This slide sets the narrative for the entire QBU.

### C — Operational Performance
- C.1: Work tickets MUST show YoY comparison with % change. Include a Key Takeaway narrative explaining the numbers (e.g., "11.7% decrease reflects addition of 3rd shift and improved technology adoption").
- C.2: Audit and action counts MUST compare to prior quarter. Explain discrepancies.
- C.3: Visual data breakdown of corrective action areas with counts. Include a Key Takeaway interpreting what the top corrective action areas indicate about operational focus and priorities.
- EVERY KPI must have an interpretation sentence AND a next action — raw numbers without context are useless.

### D — Projects & Satisfaction
- D.1: Organize by category. Be specific: name buildings, describe what was done. Polish raw project descriptions into concise, professional summaries that convey scope and impact.
- D.2: Real photos with captions. Photos tagged as Before/After will be automatically paired on slides. Reference before/after transformations in your D.1 narrative where relevant.
- D.3: Actual client quotes from emails/texts/meetings. Attribute by name. Organize by location. Keep all quotes EXACTLY as provided — only improve framing and organization.

### E — Challenges
- Must be RECURRING issues, not one-time incidents.
- Every challenge MUST map to an action taken or planned.
- Tag each with location.
- If action was committed last quarter, report whether it was delivered.

### F — Financial
- Don't avoid uncomfortable AR conversations. Show total outstanding with as-of date.
- Break down by aging bucket: 1–30, 31–60, 61–90, 91+ days.
- Include financial strategy notes. Polish raw strategy notes into professional bullets that frame the financial position clearly — address collection efforts, payment trends, and next steps.

### G — Innovation & Roadmap
- G.1: New tech, equipment, or process improvements. Connect each to an operational benefit. Polish raw innovation descriptions into clear, benefit-driven summaries. Innovation photos appear on their own slides after G.1. Reference visual evidence in your G.1 narrative when photos exist.
- G.2: Concrete next-quarter look-ahead — this becomes the outline for the next QBU. Not vague goals. Polish initiative descriptions and connect the goal statement to operational outcomes.

## NARRATIVE FLOW
Your job is to build a compelling, cohesive story across ALL 16 slides — not just the ones with obvious narrative sections.

**Story arc:** B.1 sets the narrative (what happened this quarter). C slides prove it with data. D shows the work in action. E is transparent about challenges. F handles finances directly. G looks ahead.

**Supporting documents** (questionnaires, call transcripts, meeting notes) provide the texture. Use them throughout the entire QBU to add specificity and context — not just in B.1. If a site manager mentioned a specific project success in a call transcript, that should inform how you describe it in D.1. If a questionnaire reveals financial concerns, that shapes F.1's tone.

**Rules:**
- KPI data (numbers, tables, financial figures, aging buckets) must NEVER be altered — they flow from form data directly
- Narrative text (descriptions, interpretations, strategy notes, project summaries, roadmap details) should be polished for presentation delivery
- For D.3 testimonials: keep quotes EXACT as provided — only polish the framing and organization
- Every NARRATIVE block below is REQUIRED — the PPTX generator depends on them

## SPEAKER NOTES
Include speaker notes for EVERY slide — 2-3 sentences of talking points, emphasis areas, and delivery guidance.

## OUTPUT FORMAT
For each slide, output:

**SLIDE [#]: [SECTION] — [TITLE]**
[Content formatted for the slide — bullet points, table data, narrative text as appropriate]

*Speaker Notes: [talking points for the presenter]*

For EVERY narrative section, also output a structured NARRATIVE block that the PPTX generator can parse.
The following blocks cover A.1, B.1, C.1, C.2, C.3, D.1, D.3, E.1, F.1, G.1, and G.2 — output ALL of them:

<!-- NARRATIVE:A1:TIPS -->
[3-5 actionable safety tips for the given theme, one per line. Incorporate any provided tips. Build out a complete set grounded in the theme.]
<!-- /NARRATIVE -->

<!-- NARRATIVE:A1:REMINDERS -->
[3-5 quick reminders for the given theme, one per line. Incorporate any provided reminders. Build out a complete set grounded in the theme.]
<!-- /NARRATIVE -->

<!-- NARRATIVE:A1:WHYITMATTERS -->
[Compelling "Why It Matters" paragraph connecting the safety theme to real workplace outcomes. 2-3 sentences.]
<!-- /NARRATIVE -->

<!-- NARRATIVE:B1:ACHIEVEMENTS -->
[Polished achievement bullets, one per line]
<!-- /NARRATIVE -->

<!-- NARRATIVE:B1:CHALLENGES -->
[Polished challenge bullets, one per line]
<!-- /NARRATIVE -->

<!-- NARRATIVE:B1:INNOVATIONS -->
[Polished innovation bullets, one per line]
<!-- /NARRATIVE -->

<!-- NARRATIVE:C1:TAKEAWAY -->
[Polished key takeaway text for work tickets]
<!-- /NARRATIVE -->

<!-- NARRATIVE:C2:ANALYSIS -->
[Polished audit analysis narrative]
<!-- /NARRATIVE -->

<!-- NARRATIVE:E1:CHALLENGES -->
[location | polished challenge text (do NOT include the location in this text — it goes in the first field only) | polished action text]
[location | polished challenge text | polished action text]
<!-- /NARRATIVE -->

<!-- NARRATIVE:C3:TAKEAWAY -->
[1-2 sentence interpretation of the top corrective action areas and what they indicate about operational focus]
<!-- /NARRATIVE -->

<!-- NARRATIVE:D1:PROJECTS -->
[Polished project descriptions organized by category, one per line, in format: category | description]
<!-- /NARRATIVE -->

<!-- NARRATIVE:D3:TESTIMONIALS -->
[Polished testimonial entries, one per line, in format: location | exact quote (do not alter the quote text) | attribution name]
<!-- /NARRATIVE -->

<!-- NARRATIVE:F1:STRATEGY -->
[Polished financial strategy narrative — 2-4 bullets that frame the financial position professionally, one per line]
<!-- /NARRATIVE -->

<!-- NARRATIVE:G1:INNOVATIONS -->
[Polished innovation entries, one per line, in format: innovation name | description with benefit connected]
<!-- /NARRATIVE -->

<!-- NARRATIVE:G2:ROADMAP -->
[Polished roadmap entries, one per line, in format: month | initiative name | details]
<!-- /NARRATIVE -->

<!-- NARRATIVE:G2:GOAL -->
[Polished quarter goal statement — 1-2 sentences connecting the roadmap to operational outcomes]
<!-- /NARRATIVE -->

These NARRATIVE blocks are REQUIRED — ALWAYS output them. The PPTX generator parses these blocks to build the slides. Without them, slides fall back to raw form data and lose your polished content.

## QUALITY RULES
- ALL metrics must be real — if data is missing, use [PLACEHOLDER: description] and flag it.
- Every KPI needs an interpretation sentence and next action.
- Every challenge maps to an action taken.
- YoY comparisons calculated correctly with % change.
- No banned phrases: "transformational", "best-in-class", "synergy", "cutting-edge", "state-of-the-art", "holistic", "paradigm".
- Be concrete: name the building, cite the metric, specify the timeframe.
- Tone: professional, warm, operationally specific.`,

  knowledgeModules: [
    'QBU Builder Skill',
    'Brand Standards',
    'Claim Governance',
    'Company Profile',
  ],

  actions: {
    generateQBU: {
      label: 'Generate QBU',
      description: 'Generate a complete Quarterly Business Update from intake data',
      promptTemplate: (data) => {
        const c = data.cover || data;
        const sections = [];

        sections.push(`Generate a complete 16-slide QBU deck following the A.1/B.1/C.1 section numbering convention.\n`);
        sections.push(`=== COVER DATA ===`);
        sections.push(`Client: ${c.clientName || '[Client]'}`);
        sections.push(`Quarter: ${c.quarter || '[Quarter]'}`);
        sections.push(`Date: ${c.date || '[Date]'}`);
        if (c.jobName) sections.push(`Job: ${c.jobName} (${c.jobNumber || 'N/A'})`);
        if (c.regionVP) sections.push(`Region VP: ${c.regionVP}`);

        if (c.aaTeam?.filter(t => t.name).length) {
          sections.push(`\nCompany Team Attendees:`);
          c.aaTeam.filter(t => t.name).forEach(t => sections.push(`  - ${t.name}, ${t.title}`));
        }
        if (c.clientTeam?.filter(t => t.name).length) {
          sections.push(`Client Team Attendees:`);
          c.clientTeam.filter(t => t.name).forEach(t => sections.push(`  - ${t.name}, ${t.title}`));
        }

        // Supporting documents
        const docs = (data.documents?.files || []).filter(d => d.extractedText);
        if (docs.length) {
          sections.push(`\n=== SUPPORTING DOCUMENTS ===`);
          sections.push(`The following documents provide qualitative context from site managers and internal review calls.`);
          sections.push(`Use this context to write richer, more situation-aware narrative throughout the QBU.\n`);
          docs.forEach((doc, i) => {
            sections.push(`--- Document ${i + 1}: ${doc.label} (${doc.name}) ---`);
            sections.push(doc.extractedText);
            sections.push('');
          });
        }

        if (data.safety) {
          const s = data.safety;
          sections.push(`\n=== A — SAFETY DATA ===`);
          if (s.theme) sections.push(`Safety Moment Theme: ${s.theme}`);
          if (s.keyTips) sections.push(`Key Tips:\n${s.keyTips}`);
          if (s.quickReminders) sections.push(`Quick Reminders:\n${s.quickReminders}`);
          if (s.whyItMatters) sections.push(`Why It Matters:\n${s.whyItMatters}`);
          if (s.incidents?.filter(r => r.location).length) {
            sections.push(`\nRecordable Incidents by Location/Quarter:`);
            s.incidents.filter(r => r.location).forEach(r =>
              sections.push(`  ${r.location}: Q1=${r.q1||0}, Q2=${r.q2||0}, Q3=${r.q3||0}, Q4=${r.q4||0}`)
            );
          }
          if (s.goodSaves?.filter(r => r.location).length) {
            sections.push(`\nGood Saves:`);
            s.goodSaves.filter(r => r.location).forEach(r =>
              sections.push(`  ${r.location}: Hazard="${r.hazard}" → Action="${r.action}" → Notified="${r.notified}"`)
            );
          }
          if (s.incidentDetails?.filter(r => r.location).length) {
            sections.push(`\nRecordable Incident Details:`);
            s.incidentDetails.filter(r => r.location).forEach(r =>
              sections.push(`  ${r.location} on ${r.date}: Cause="${r.cause}", Treatment="${r.treatment}", RTW="${r.returnDate}"`)
            );
          }
        }

        if (data.executive) {
          const e = data.executive;
          sections.push(`\n=== B — EXECUTIVE SUMMARY DATA ===`);
          if (e.achievements?.filter(Boolean).length) {
            sections.push(`Key Achievements:`);
            e.achievements.filter(Boolean).forEach((a, i) => sections.push(`  ${i+1}. ${a}`));
          }
          if (e.challenges?.filter(Boolean).length) {
            sections.push(`Strategic Challenges:`);
            e.challenges.filter(Boolean).forEach((c, i) => sections.push(`  ${i+1}. ${c}`));
          }
          if (e.innovations?.filter(Boolean).length) {
            sections.push(`Innovation Milestones:`);
            e.innovations.filter(Boolean).forEach((n, i) => sections.push(`  ${i+1}. ${n}`));
          }
        }

        if (data.workTickets) {
          const w = data.workTickets;
          sections.push(`\n=== C.1 — WORK TICKETS DATA ===`);
          if (w.locations?.filter(r => r.location).length) {
            sections.push(`YoY Work Ticket Comparison:`);
            w.locations.filter(r => r.location).forEach(r => {
              const pct = r.priorYear && r.currentYear
                ? (((Number(r.currentYear) - Number(r.priorYear)) / Number(r.priorYear)) * 100).toFixed(1)
                : 'N/A';
              sections.push(`  ${r.location}: Prior Year=${r.priorYear}, Current Year=${r.currentYear}, Change=${pct}%`);
            });
          }
          if (w.keyTakeaway) sections.push(`Key Takeaway: ${w.keyTakeaway}`);
          if (w.eventsSupported) sections.push(`Events Supported:\n${w.eventsSupported}`);
        }

        if (data.audits) {
          const a = data.audits;
          sections.push(`\n=== C.2/C.3 — AUDITS DATA ===`);
          const names = (a.locationNames || []).filter(Boolean);
          if (names.length) {
            sections.push(`Locations: ${names.join(', ')}`);
            sections.push(`Prior Quarter Audits: ${a.priorAudits.join(', ')} (Total: ${a.priorAudits.reduce((s,v) => s + (Number(v)||0), 0)})`);
            sections.push(`Prior Quarter Actions: ${a.priorActions.join(', ')} (Total: ${a.priorActions.reduce((s,v) => s + (Number(v)||0), 0)})`);
            sections.push(`Current Quarter Audits: ${a.currentAudits.join(', ')} (Total: ${a.currentAudits.reduce((s,v) => s + (Number(v)||0), 0)})`);
            sections.push(`Current Quarter Actions: ${a.currentActions.join(', ')} (Total: ${a.currentActions.reduce((s,v) => s + (Number(v)||0), 0)})`);
          }
          if (a.auditExplanation) sections.push(`Audit Change Explanation: ${a.auditExplanation}`);
          if (a.actionExplanation) sections.push(`Action Change Explanation: ${a.actionExplanation}`);
          if (a.topAreas?.filter(r => r.count).length) {
            sections.push(`\nTop Corrective Action Areas:`);
            a.topAreas.filter(r => r.count).forEach(r => sections.push(`  ${r.area}: ${r.count}`));
          }
        }

        if (data.projects) {
          const p = data.projects;
          sections.push(`\n=== D — PROJECTS & SATISFACTION DATA ===`);
          if (p.completed?.filter(r => r.description).length) {
            sections.push(`Completed Projects:`);
            p.completed.filter(r => r.description).forEach(r => sections.push(`  [${r.category}] ${r.description}`));
          }
          if (p.photos?.length) {
            sections.push(`\nProject Photos: ${p.photos.length} uploaded`);
            p.photos.filter(ph => ph.caption).forEach(ph =>
              sections.push(`  Photo (${ph.type || 'general'}): "${ph.caption}"${ph.location ? ` at ${ph.location}` : ''}`)
            );
          }
          if (p.testimonials?.filter(r => r.quote).length) {
            sections.push(`\nClient Testimonials:`);
            p.testimonials.filter(r => r.quote).forEach(r =>
              sections.push(`  "${r.quote}" — ${r.attribution}, ${r.location}`)
            );
          }
        }

        if (data.challenges) {
          const ch = data.challenges;
          sections.push(`\n=== E — CHALLENGES & ACTIONS DATA ===`);
          if (ch.items?.filter(r => r.challenge).length) {
            sections.push(`Current Challenges:`);
            ch.items.filter(r => r.challenge).forEach(r =>
              sections.push(`  ${r.location}: Challenge="${r.challenge}" → Action="${r.action}"`)
            );
          }
          if (ch.priorFollowUp?.filter(r => r.action).length) {
            sections.push(`\nPrior Quarter Follow-Up:`);
            ch.priorFollowUp.filter(r => r.action).forEach(r =>
              sections.push(`  "${r.action}" — Status: ${r.status}${r.notes ? `, Notes: ${r.notes}` : ''}`)
            );
          }
        }

        if (data.financial) {
          const f = data.financial;
          sections.push(`\n=== F — FINANCIAL DATA ===`);
          if (f.totalOutstanding) sections.push(`Total Outstanding: ${f.totalOutstanding} as of ${f.asOfDate || 'current'}`);
          if (f.bucket30 || f.bucket60 || f.bucket90 || f.bucket91) {
            sections.push(`Aging Breakdown:`);
            sections.push(`  1-30 days: ${f.bucket30 || '$0'}`);
            sections.push(`  31-60 days: ${f.bucket60 || '$0'}`);
            sections.push(`  61-90 days: ${f.bucket90 || '$0'}`);
            sections.push(`  91+ days: ${f.bucket91 || '$0'}`);
          }
          if (f.strategyNotes?.filter(Boolean).length) {
            sections.push(`Financial Strategy Notes:`);
            f.strategyNotes.filter(Boolean).forEach((n, i) => sections.push(`  ${i+1}. ${n}`));
          }
        }

        if (data.roadmap) {
          const r = data.roadmap;
          sections.push(`\n=== G — INNOVATION & ROADMAP DATA ===`);
          if (r.highlights?.filter(h => h.innovation).length) {
            sections.push(`Innovation Highlights:`);
            r.highlights.filter(h => h.innovation).forEach(h =>
              sections.push(`  ${h.innovation}: ${h.description} → Benefit: ${h.benefit}`)
            );
          }
          if (r.photos?.length) {
            sections.push(`\nInnovation Photos: ${r.photos.length} uploaded`);
            r.photos.filter(ph => ph.caption).forEach(ph =>
              sections.push(`  Photo (${ph.type || 'general'}): "${ph.caption}"${ph.location ? ` at ${ph.location}` : ''}`)
            );
          }
          if (r.schedule?.filter(s => s.initiative).length) {
            sections.push(`\nNext Quarter Roadmap:`);
            r.schedule.filter(s => s.initiative).forEach(s =>
              sections.push(`  ${s.month}: ${s.initiative} — ${s.details}`)
            );
          }
          if (r.goalStatement) sections.push(`\nQuarter Goal Statement: ${r.goalStatement}`);
        }

        sections.push(`\n=== INSTRUCTIONS ===`);
        sections.push(`Generate the complete QBU as 16 slides following the section numbering (A.1, A.2, B.1, C.1, C.2, C.3, D.1, D.2, D.3, E.1, F.1, G.1, G.2).`);
        sections.push(`For each slide, provide:`);
        sections.push(`1. Polished, presentation-ready content (not just the raw data — interpret it, add context)`);
        sections.push(`2. Speaker notes with talking points`);
        sections.push(`3. KPI interpretation sentences where applicable`);
        sections.push(`4. [PLACEHOLDER] markers for any missing required data`);
        sections.push(`\nDo NOT just echo back the raw data. Your job is to transform the intake data into polished QBU content with narrative, interpretation, and delivery guidance.`);

        return sections.join('\n');
      },
    },
  },
};
