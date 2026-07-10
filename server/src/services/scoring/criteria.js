// IB Mathematics: Applications and Interpretation (AI) — Internal Assessment
// criteria. Criteria A–D are identical across AA/AI and across SL/HL; E differs
// by level (handled later in Step 5).
//
// The descriptor wording below follows IB's published markbands. Assessment
// uses the "best-fit" method: read all levels, pick the one that most fairly
// reflects the overall balance of achievement — every element of a descriptor
// need NOT be met. Marks are whole numbers only.
//
// confidenceTier drives how the result is surfaced (see confidence tiering):
//   A, B -> high   (score directly)
//   D, E -> medium (score with a visible reasoning trail; flag boundaries)
//   C    -> low    (advisory range only; mandatory teacher review)

export const CRITERIA = {
  A: {
    name: 'Presentation',
    maxMark: 4,
    confidenceTier: 'high',
    focus:
      'Coherence and organization of the exploration: clear intro/aim/conclusion, logical structure, graphs/tables placed in-body (not in appendices), and conciseness (no repetitive or irrelevant content).',
    bands: [
      { mark: 0, descriptor: 'The exploration does not reach the standard described by the descriptors below.' },
      { mark: 1, descriptor: 'The exploration has some coherence or some organization.' },
      { mark: 2, descriptor: 'The exploration has some coherence and shows some organization.' },
      { mark: 3, descriptor: 'The exploration is coherent and well organized.' },
      { mark: 4, descriptor: 'The exploration is coherent, well organized, concise and complete.' },
    ],
    guidance:
      'Coherent = logically developed and easy to follow, reads as a unified whole. Well organized = has an introduction, a clear rationale/aim, and a conclusion; graphs, tables and diagrams appear in the body where they are relevant, not dumped in appendices. Concise = focused on the aim, with no irrelevant, repetitive or padding material. Complete = all steps of the work are present. Length is not a proxy for quality — a long, padded exploration is LESS concise.',
  },

  B: {
    name: 'Mathematical communication',
    maxMark: 4,
    confidenceTier: 'high',
    focus:
      'Use of appropriate mathematical language: correct notation, symbols and terminology (not raw calculator/graphing syntax unless software-generated); key terms and variables defined; multiple forms of representation used where appropriate (formulae, diagrams, tables, graphs); a deductive method used where appropriate.',
    bands: [
      { mark: 0, descriptor: 'The exploration does not reach the standard described by the descriptors below.' },
      { mark: 1, descriptor: 'The exploration contains some relevant mathematical communication which is partially appropriate.' },
      { mark: 2, descriptor: 'The exploration contains some relevant appropriate mathematical communication.' },
      { mark: 3, descriptor: 'The mathematical communication is relevant, appropriate and is mostly consistent.' },
      { mark: 4, descriptor: 'The mathematical communication is relevant, appropriate and consistent throughout.' },
    ],
    guidance:
      'Appropriate communication means: using proper mathematical notation rather than calculator syntax (e.g. write x^2 or superscript, not "x^2" as typed into a calculator; use correct symbols for ≤, ∑, etc.); defining key terms and variables the first time they are used; choosing suitable forms of representation (a graph where a graph clarifies, a table where a table clarifies); and setting out reasoning deductively where appropriate. "Consistent throughout" (level 4) means the appropriate communication is sustained across the whole exploration, not just in places.',
  },

  D: {
    name: 'Reflection',
    maxMark: 3,
    confidenceTier: 'medium',
    focus:
      'How the student reviews and evaluates their own work. Reflection can appear ANYWHERE — not just the conclusion. Limited = merely describing results. Meaningful = linking back to the aim and discussing limitations. Critical = discussing implications, considering strengths/weaknesses, comparing different mathematical approaches, and considering alternatives or next steps.',
    bands: [
      { mark: 0, descriptor: 'The exploration does not reach the standard described by the descriptors below.' },
      { mark: 1, descriptor: 'There is evidence of limited reflection.' },
      { mark: 2, descriptor: 'There is evidence of meaningful reflection.' },
      { mark: 3, descriptor: 'There is substantial evidence of critical reflection.' },
    ],
    guidance:
      'Look for reflection throughout the whole exploration, not only at the end. Limited (1) = the student mainly describes what they did or what the results were. Meaningful (2) = the student links results back to the stated aim and discusses limitations or whether results are reasonable. Critical (3) = the student discusses implications, weighs strengths and weaknesses of their method, compares alternative approaches, and/or considers what they would do differently — AND this critical reflection is substantial and sustained across the exploration, not a single strong closing paragraph. A powerful final paragraph alone is meaningful (2), not critical (3).',
  },

  E: {
    name: 'Use of mathematics',
    maxMark: 6,
    confidenceTier: 'medium',
    // Criterion E is the only criterion whose descriptors differ by level: HL
    // requires "sophistication and rigour" at the top bands, SL does not.
    levelDependent: true,
    focus:
      'The mathematics itself: is it relevant to the aim, correct, commensurate with the course level, and does it demonstrate genuine understanding (not just a correct final answer)? Correctness must be actively verified where feasible, not assumed from how mathematical the work looks.',
    bandsByLevel: {
      SL: [
        { mark: 0, descriptor: 'The exploration does not reach the standard described by the descriptors below.' },
        { mark: 1, descriptor: 'Some relevant mathematics is used.' },
        { mark: 2, descriptor: 'Some relevant mathematics is used. Limited understanding is demonstrated.' },
        { mark: 3, descriptor: 'Relevant mathematics commensurate with the level of the course is used. Limited understanding is demonstrated.' },
        { mark: 4, descriptor: 'Relevant mathematics commensurate with the level of the course is used. The mathematics explored is partially correct. Some knowledge and understanding are demonstrated.' },
        { mark: 5, descriptor: 'Relevant mathematics commensurate with the level of the course is used. The mathematics explored is mostly correct. Good knowledge and understanding are demonstrated.' },
        { mark: 6, descriptor: 'Relevant mathematics commensurate with the level of the course is used. The mathematics explored is correct. Thorough knowledge and understanding are demonstrated.' },
      ],
      HL: [
        { mark: 0, descriptor: 'The exploration does not reach the standard described by the descriptors below.' },
        { mark: 1, descriptor: 'Some relevant mathematics is used.' },
        { mark: 2, descriptor: 'Some relevant mathematics is used. Limited understanding is demonstrated.' },
        { mark: 3, descriptor: 'Relevant mathematics commensurate with the level of the course is used. Limited understanding is demonstrated.' },
        { mark: 4, descriptor: 'Relevant mathematics commensurate with the level of the course is used. The mathematics explored is partially correct. Some knowledge and understanding are demonstrated.' },
        { mark: 5, descriptor: 'Relevant mathematics commensurate with the level of the course is used. The mathematics explored is mostly correct. Good knowledge and understanding are demonstrated. It demonstrates some sophistication or rigour.' },
        { mark: 6, descriptor: 'Relevant mathematics commensurate with the level of the course is used. The mathematics explored is correct and demonstrates sophistication and rigour. Thorough knowledge and understanding are demonstrated.' },
      ],
    },
    guidance:
      'Assess the actual mathematics, not its surface appearance. Verify correctness where feasible: follow the derivations, check that stated results (regression coefficients, R², test statistics, solved values, etc.) genuinely follow from the data and methods shown, and flag any computational or logical errors — correctness is decisive (4 = partially correct, 5 = mostly correct, 6 = correct). "Commensurate with the level of the course" means the mathematics is at the level expected for this Mathematics course (AA or AI) at this level; trivial or off-syllabus mathematics limits the mark. "Understanding" means the student shows they grasp what they are doing, not merely that a final answer is right. LEVEL DIFFERENCE: at SL, sophistication and rigour are NOT required for full marks; at HL, level 5 requires some sophistication or rigour and level 6 requires both.',
  },

  C: {
    name: 'Personal engagement',
    maxMark: 3,
    // Inherently holistic and subjective: ALWAYS low-confidence, presented as a
    // suggested range (never a definitive number), and routed to mandatory
    // teacher review regardless of how confident the analysis feels.
    confidenceTier: 'low',
    focus:
      'The extent of GENUINE personal engagement with the topic — NOT a measure of effort or time spent. Look for independent and creative thinking, the student\'s own perspective rather than textbook reproduction, asking their own questions, making and testing predictions, and exploring the topic from different angles.',
    bands: [
      { mark: 0, descriptor: 'The exploration does not reach the standard described by the descriptors below.' },
      { mark: 1, descriptor: 'There is evidence of some personal engagement.' },
      { mark: 2, descriptor: 'There is evidence of significant personal engagement.' },
      { mark: 3, descriptor: 'There is evidence of outstanding personal engagement.' },
    ],
    guidance:
      'Personal engagement is about authentic ownership of the exploration, not diligence. Evidence includes: framing the problem in the student\'s own way, creative or independent approaches, testing their own conjectures, bringing a personal perspective or context, and genuine curiosity — as opposed to reproducing standard textbook material. It is NOT measured by length, neatness, or amount of work. Because this judgement is holistic and hard to evidence from text alone, give a SUGGESTED RANGE rather than a single mark, and the teacher always makes the final decision.',
  },
};

// The subset of criteria implemented at each build step. Extend as we go.
export const IMPLEMENTED_CRITERIA = ['A', 'B', 'D', 'E', 'C'];
