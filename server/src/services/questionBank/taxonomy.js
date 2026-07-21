// Tests: server/test/questionBank/taxonomy.test.js  (run: npm test, from server/)
//
// Rulebook §8 — IB Mathematics topic / sub-topic taxonomy (AA + AI, complete).
//
// This is the SINGLE SOURCE OF TRUTH for sub-topic codes. It is consumed by:
//   * the topic-picker UI, via GET /api/question-bank/taxonomy (the client must
//     NOT keep its own copy)
//   * generation-time validation (§10 items 1, 2 and 9)
//
// ---------------------------------------------------------------------------
// CRITICAL: codes are NOT globally unique — they are unique only WITHIN a
// course. Never look a code up without its course. Two worked examples of why:
//
//   AHL5.13  in AA = L'Hopital's rule
//   AHL5.13  in AI = Kinematic problems            <- same code, different topic
//
//   AHL5.9   in AA = DOES NOT EXIST (AA calculus AHL runs 5.12-5.19)
//   AHL5.9   in AI = derivative rules (sin/cos/tan/e^x/ln x + chain/product/quotient)
//
// A previous iteration fabricated "AHL5.9 = kinematics" for BOTH courses; it is
// wrong in AA (no such code) and wrong in AI (means derivative rules).
// For the record: AA kinematics is SL5.9. AI kinematics is AHL5.13 (calculus)
// or AHL3.12 (via vectors), and AI excludes kinematics at SL entirely (SL5.7).
// ---------------------------------------------------------------------------
//
// Two different senses of "level" appear in this domain; keep them distinct:
//   * entry.level   'SL' | 'AHL'  — which part of the syllabus the content is in
//   * student level 'SL' | 'HL'   — what the student is enrolled in
// An HL student studies SL *and* AHL content; an SL student studies SL only.
// See subtopicsFor() — this is the §2.3 guarantee, enforced in code.

export const COURSES = ['AA', 'AI'];

/** Student enrolment levels (NOT the same as an entry's syllabus level). */
export const STUDENT_LEVELS = ['SL', 'HL'];

/** The five topics, shared by both courses. `number` keys §2.1 weighting. */
export const TOPICS = [
  { number: 1, name: 'Number and Algebra' },
  { number: 2, name: 'Functions' },
  { number: 3, name: 'Geometry and Trigonometry' },
  { number: 4, name: 'Statistics and Probability' },
  { number: 5, name: 'Calculus' },
];

/**
 * Flat entry list. Each: { course, topic, code, level, description }
 *   course      'AA' | 'AI'
 *   topic       1..5 (matches TOPICS[].number)
 *   code        e.g. 'SL5.9', 'AHL3.12' — unique within its course only
 *   level       'SL' | 'AHL'
 *   description verbatim from the subject guide summary in §8
 */
export const TAXONOMY = [
  // ===================== AA — Analysis and Approaches =====================
  // --- AA Topic 1: Number and Algebra ---
  { course: 'AA', topic: 1, code: 'SL1.1', level: 'SL', description: "Operations with numbers in the form a×10ᵏ" },
  { course: 'AA', topic: 1, code: 'SL1.2', level: 'SL', description: "Arithmetic sequences and series" },
  { course: 'AA', topic: 1, code: 'SL1.3', level: 'SL', description: "Geometric sequences and series" },
  { course: 'AA', topic: 1, code: 'SL1.4', level: 'SL', description: "Financial applications of geometric sequences (compound interest, depreciation)" },
  { course: 'AA', topic: 1, code: 'SL1.5', level: 'SL', description: "Laws of exponents; intro to logarithms (base 10, e)" },
  { course: 'AA', topic: 1, code: 'SL1.6', level: 'SL', description: "Simple deductive proof" },
  { course: 'AA', topic: 1, code: 'SL1.7', level: 'SL', description: "Laws of exponents (rational) and laws of logarithms" },
  { course: 'AA', topic: 1, code: 'SL1.8', level: 'SL', description: "Sum of infinite convergent geometric sequences" },
  { course: 'AA', topic: 1, code: 'SL1.9', level: 'SL', description: "Binomial theorem" },
  { course: 'AA', topic: 1, code: 'AHL1.10', level: 'AHL', description: "Counting principles; extension of binomial theorem to fractional/negative indices" },
  { course: 'AA', topic: 1, code: 'AHL1.11', level: 'AHL', description: "Partial fractions" },
  { course: 'AA', topic: 1, code: 'AHL1.12', level: 'AHL', description: "Complex numbers (Cartesian form, Argand diagram)" },
  { course: 'AA', topic: 1, code: 'AHL1.13', level: 'AHL', description: "Modulus-argument (polar) and exponential (Euler) form" },
  { course: 'AA', topic: 1, code: 'AHL1.14', level: 'AHL', description: "Complex conjugate roots; De Moivre's theorem" },
  { course: 'AA', topic: 1, code: 'AHL1.15', level: 'AHL', description: "Proof by induction, contradiction, counterexample" },
  { course: 'AA', topic: 1, code: 'AHL1.16', level: 'AHL', description: "Solutions of systems of linear equations" },

  // --- AA Topic 2: Functions ---
  { course: 'AA', topic: 2, code: 'SL2.1', level: 'SL', description: "Equations of a straight line" },
  { course: 'AA', topic: 2, code: 'SL2.2', level: 'SL', description: "Concept of function, domain/range, inverse (informal)" },
  { course: 'AA', topic: 2, code: 'SL2.3', level: 'SL', description: "Graph of a function" },
  { course: 'AA', topic: 2, code: 'SL2.4', level: 'SL', description: "Key features of graphs" },
  { course: 'AA', topic: 2, code: 'SL2.5', level: 'SL', description: "Composite functions; inverse function (formal)" },
  { course: 'AA', topic: 2, code: 'SL2.6', level: 'SL', description: "Quadratic function, forms and vertex" },
  { course: 'AA', topic: 2, code: 'SL2.7', level: 'SL', description: "Solving quadratic equations/inequalities, discriminant" },
  { course: 'AA', topic: 2, code: 'SL2.8', level: 'SL', description: "Reciprocal function; rational functions of form (ax+b)/(cx+d)" },
  { course: 'AA', topic: 2, code: 'SL2.9', level: 'SL', description: "Exponential and logarithmic functions" },
  { course: 'AA', topic: 2, code: 'SL2.10', level: 'SL', description: "Solving equations graphically and analytically" },
  { course: 'AA', topic: 2, code: 'SL2.11', level: 'SL', description: "Transformations of graphs" },
  { course: 'AA', topic: 2, code: 'AHL2.12', level: 'AHL', description: "Polynomial functions, factor/remainder theorems, sum/product of roots" },
  { course: 'AA', topic: 2, code: 'AHL2.13', level: 'AHL', description: "General rational functions" },
  { course: 'AA', topic: 2, code: 'AHL2.14', level: 'AHL', description: "Odd/even functions; inverse with domain restriction" },
  { course: 'AA', topic: 2, code: 'AHL2.15', level: 'AHL', description: "Solving g(x) ≥ f(x)" },
  { course: 'AA', topic: 2, code: 'AHL2.16', level: 'AHL', description: "Graphs of |f(x)|, modulus equations/inequalities" },

  // --- AA Topic 3: Geometry and Trigonometry ---
  { course: 'AA', topic: 3, code: 'SL3.1', level: 'SL', description: "3D distance/midpoint; volume/surface area; angle between line and plane" },
  { course: 'AA', topic: 3, code: 'SL3.2', level: 'SL', description: "Sine/cosine/tangent ratios; sine rule; cosine rule; area of triangle" },
  { course: 'AA', topic: 3, code: 'SL3.3', level: 'SL', description: "Applications of right/non-right-angled trigonometry" },
  { course: 'AA', topic: 3, code: 'SL3.4', level: 'SL', description: "Radian measure; arc length; sector area" },
  { course: 'AA', topic: 3, code: 'SL3.5', level: 'SL', description: "Unit-circle definitions of sin/cos; tan; exact values; ambiguous case of sine rule" },
  { course: 'AA', topic: 3, code: 'SL3.6', level: 'SL', description: "Pythagorean identity; double angle identities" },
  { course: 'AA', topic: 3, code: 'SL3.7', level: 'SL', description: "Circular functions sin/cos/tan — graphs, amplitude, period" },
  { course: 'AA', topic: 3, code: 'SL3.8', level: 'SL', description: "Solving trigonometric equations (finite interval)" },
  { course: 'AA', topic: 3, code: 'AHL3.9', level: 'AHL', description: "Reciprocal trig ratios (sec/cosec/cot); inverse functions arcsin/arccos/arctan" },
  { course: 'AA', topic: 3, code: 'AHL3.10', level: 'AHL', description: "Compound angle identities" },
  { course: 'AA', topic: 3, code: 'AHL3.11', level: 'AHL', description: "Trig function symmetry relationships" },
  { course: 'AA', topic: 3, code: 'AHL3.12', level: 'AHL', description: "Vectors — concept, components, base vectors" },
  { course: 'AA', topic: 3, code: 'AHL3.13', level: 'AHL', description: "Scalar product" },
  { course: 'AA', topic: 3, code: 'AHL3.14', level: 'AHL', description: "Vector equation of a line" },
  { course: 'AA', topic: 3, code: 'AHL3.15', level: 'AHL', description: "Coincident/parallel/intersecting/skew lines" },
  { course: 'AA', topic: 3, code: 'AHL3.16', level: 'AHL', description: "Vector (cross) product" },
  { course: 'AA', topic: 3, code: 'AHL3.17', level: 'AHL', description: "Vector equation of a plane" },
  { course: 'AA', topic: 3, code: 'AHL3.18', level: 'AHL', description: "Intersections of line-plane, plane-plane, three planes" },

  // --- AA Topic 4: Statistics and Probability ---
  { course: 'AA', topic: 4, code: 'SL4.1', level: 'SL', description: "Population/sample, sampling techniques, outliers" },
  { course: 'AA', topic: 4, code: 'SL4.2', level: 'SL', description: "Presentation of data, histograms, box-and-whisker" },
  { course: 'AA', topic: 4, code: 'SL4.3', level: 'SL', description: "Central tendency and dispersion measures" },
  { course: 'AA', topic: 4, code: 'SL4.4', level: 'SL', description: "Linear correlation, Pearson's r, regression line (y on x)" },
  { course: 'AA', topic: 4, code: 'SL4.5', level: 'SL', description: "Probability concepts, expected number of occurrences" },
  { course: 'AA', topic: 4, code: 'SL4.6', level: 'SL', description: "Venn/tree diagrams; combined, mutually exclusive, conditional, independent events" },
  { course: 'AA', topic: 4, code: 'SL4.7', level: 'SL', description: "Discrete random variables and expected value" },
  { course: 'AA', topic: 4, code: 'SL4.8', level: 'SL', description: "Binomial distribution" },
  { course: 'AA', topic: 4, code: 'SL4.9', level: 'SL', description: "Normal distribution" },
  { course: 'AA', topic: 4, code: 'SL4.10', level: 'SL', description: "Regression line (x on y)" },
  { course: 'AA', topic: 4, code: 'SL4.11', level: 'SL', description: "Formal conditional probability/independence formulae" },
  { course: 'AA', topic: 4, code: 'SL4.12', level: 'SL', description: "Standardization of normal variables (z-values)" },
  { course: 'AA', topic: 4, code: 'AHL4.13', level: 'AHL', description: "Bayes' theorem" },
  { course: 'AA', topic: 4, code: 'AHL4.14', level: 'AHL', description: "Variance of discrete RV; continuous RV and probability density functions" },

  // --- AA Topic 5: Calculus ---
  { course: 'AA', topic: 5, code: 'SL5.1', level: 'SL', description: "Concept of a limit; derivative as gradient/rate of change" },
  { course: 'AA', topic: 5, code: 'SL5.2', level: 'SL', description: "Increasing/decreasing functions" },
  { course: 'AA', topic: 5, code: 'SL5.3', level: 'SL', description: "Derivative of axⁿ" },
  { course: 'AA', topic: 5, code: 'SL5.4', level: 'SL', description: "Tangents and normals" },
  { course: 'AA', topic: 5, code: 'SL5.5', level: 'SL', description: "Integration as anti-differentiation" },
  { course: 'AA', topic: 5, code: 'SL5.6', level: 'SL', description: "Derivatives of xⁿ, sinx, cosx, eˣ, lnx; chain, product, quotient rules" },
  { course: 'AA', topic: 5, code: 'SL5.7', level: 'SL', description: "Second derivative" },
  { course: 'AA', topic: 5, code: 'SL5.8', level: 'SL', description: "Local max/min, optimization, points of inflexion" },
  // NOTE: AA kinematics lives here at SL5.9 — NOT at any AHL code.
  { course: 'AA', topic: 5, code: 'SL5.9', level: 'SL', description: "Kinematics (displacement/velocity/acceleration)" },
  { course: 'AA', topic: 5, code: 'SL5.10', level: 'SL', description: "Indefinite integrals; integration by inspection/substitution" },
  { course: 'AA', topic: 5, code: 'SL5.11', level: 'SL', description: "Definite integrals; area under a curve" },
  { course: 'AA', topic: 5, code: 'AHL5.12', level: 'AHL', description: "Continuity/differentiability; derivative from first principles; higher derivatives" },
  { course: 'AA', topic: 5, code: 'AHL5.13', level: 'AHL', description: "L'Hôpital's rule" },
  { course: 'AA', topic: 5, code: 'AHL5.14', level: 'AHL', description: "Implicit differentiation; related rates; optimization" },
  { course: 'AA', topic: 5, code: 'AHL5.15', level: 'AHL', description: "Derivatives/integrals of tan, sec, cosec, cot, aˣ, logₐx, arcsin/arccos/arctan; partial fractions in integration" },
  { course: 'AA', topic: 5, code: 'AHL5.16', level: 'AHL', description: "Integration by substitution and by parts" },
  { course: 'AA', topic: 5, code: 'AHL5.17', level: 'AHL', description: "Area enclosed by curve and y-axis; volumes of revolution" },
  { course: 'AA', topic: 5, code: 'AHL5.18', level: 'AHL', description: "First-order differential equations (separable, homogeneous, integrating factor, Euler's method)" },
  { course: 'AA', topic: 5, code: 'AHL5.19', level: 'AHL', description: "Maclaurin series" },

  // ================= AI — Applications and Interpretation =================
  // --- AI Topic 1: Number and Algebra ---
  { course: 'AI', topic: 1, code: 'SL1.1', level: 'SL', description: "Operations with numbers in the form a×10ᵏ" },
  { course: 'AI', topic: 1, code: 'SL1.2', level: 'SL', description: "Arithmetic sequences and series" },
  { course: 'AI', topic: 1, code: 'SL1.3', level: 'SL', description: "Geometric sequences and series" },
  { course: 'AI', topic: 1, code: 'SL1.4', level: 'SL', description: "Financial applications (compound interest, depreciation)" },
  { course: 'AI', topic: 1, code: 'SL1.5', level: 'SL', description: "Laws of exponents; intro to logarithms" },
  { course: 'AI', topic: 1, code: 'SL1.6', level: 'SL', description: "Approximation — decimal places, sig figs, upper/lower bounds, percentage error, estimation" },
  { course: 'AI', topic: 1, code: 'SL1.7', level: 'SL', description: "Amortization and annuities" },
  { course: 'AI', topic: 1, code: 'SL1.8', level: 'SL', description: "Using technology to solve systems of linear equations and polynomial equations" },
  { course: 'AI', topic: 1, code: 'AHL1.9', level: 'AHL', description: "Laws of logarithms" },
  { course: 'AI', topic: 1, code: 'AHL1.10', level: 'AHL', description: "Simplifying expressions with rational exponents" },
  { course: 'AI', topic: 1, code: 'AHL1.11', level: 'AHL', description: "Sum of infinite geometric sequences" },
  { course: 'AI', topic: 1, code: 'AHL1.12', level: 'AHL', description: "Complex numbers (Cartesian form, Argand diagram, complex roots of quadratics)" },
  { course: 'AI', topic: 1, code: 'AHL1.13', level: 'AHL', description: "Modulus-argument/exponential form of complex numbers" },
  { course: 'AI', topic: 1, code: 'AHL1.14', level: 'AHL', description: "Matrices — definition, algebra, multiplication, determinants/inverses, solving systems" },
  { course: 'AI', topic: 1, code: 'AHL1.15', level: 'AHL', description: "Eigenvalues, eigenvectors, diagonalization" },

  // --- AI Topic 2: Functions ---
  { course: 'AI', topic: 2, code: 'SL2.1', level: 'SL', description: "Equations of a straight line" },
  { course: 'AI', topic: 2, code: 'SL2.2', level: 'SL', description: "Concept of function, domain/range, inverse (informal)" },
  { course: 'AI', topic: 2, code: 'SL2.3', level: 'SL', description: "Graph of a function" },
  { course: 'AI', topic: 2, code: 'SL2.4', level: 'SL', description: "Key features of graphs" },
  { course: 'AI', topic: 2, code: 'SL2.5', level: 'SL', description: "Modelling with linear, quadratic, exponential, direct/inverse variation, cubic, and sinusoidal functions" },
  { course: 'AI', topic: 2, code: 'SL2.6', level: 'SL', description: "Modelling skills (fit, test, reflect, use)" },
  { course: 'AI', topic: 2, code: 'AHL2.7', level: 'AHL', description: "Composite functions; inverse function" },
  { course: 'AI', topic: 2, code: 'AHL2.8', level: 'AHL', description: "Transformations of graphs" },
  { course: 'AI', topic: 2, code: 'AHL2.9', level: 'AHL', description: "Modelling with exponential (half-life), natural logarithmic, sinusoidal (radians), logistic, and piecewise functions" },
  { course: 'AI', topic: 2, code: 'AHL2.10', level: 'AHL', description: "Scaling large/small numbers with logarithms; linearizing data; log-log/semi-log graphs" },

  // --- AI Topic 3: Geometry and Trigonometry ---
  { course: 'AI', topic: 3, code: 'SL3.1', level: 'SL', description: "3D distance/midpoint; volume/surface area; angle between line and plane" },
  { course: 'AI', topic: 3, code: 'SL3.2', level: 'SL', description: "Sine/cosine/tangent ratios; sine rule; cosine rule; area of triangle" },
  { course: 'AI', topic: 3, code: 'SL3.3', level: 'SL', description: "Applications of right/non-right-angled trigonometry" },
  { course: 'AI', topic: 3, code: 'SL3.4', level: 'SL', description: "Circle — arc length, sector area (no radians at SL)" },
  { course: 'AI', topic: 3, code: 'SL3.5', level: 'SL', description: "Equations of perpendicular bisectors" },
  { course: 'AI', topic: 3, code: 'SL3.6', level: 'SL', description: "Voronoi diagrams" },
  { course: 'AI', topic: 3, code: 'AHL3.7', level: 'AHL', description: "Radian definition and conversion" },
  { course: 'AI', topic: 3, code: 'AHL3.8', level: 'AHL', description: "Unit-circle definitions of sin/cos; Pythagorean identity; tan; ambiguous case of sine rule; graphical solving of trig equations" },
  { course: 'AI', topic: 3, code: 'AHL3.9', level: 'AHL', description: "Geometric transformations using matrices" },
  { course: 'AI', topic: 3, code: 'AHL3.10', level: 'AHL', description: "Vectors — concept, components, position vectors, rescaling/normalizing" },
  { course: 'AI', topic: 3, code: 'AHL3.11', level: 'AHL', description: "Vector equation of a line" },
  // NOTE: one of the two valid homes for AI kinematics (the other is AHL5.13).
  { course: 'AI', topic: 3, code: 'AHL3.12', level: 'AHL', description: "Vector applications to kinematics" },
  { course: 'AI', topic: 3, code: 'AHL3.13', level: 'AHL', description: "Scalar product and vector product" },

  // --- AI Topic 4: Statistics and Probability ---
  { course: 'AI', topic: 4, code: 'SL4.1', level: 'SL', description: "Population/sample/random sample; reliability and bias in sampling; interpretation of outliers" },
  { course: 'AI', topic: 4, code: 'SL4.2', level: 'SL', description: "Presentation of data — frequency tables, histograms, cumulative frequency graphs, box-and-whisker diagrams" },
  { course: 'AI', topic: 4, code: 'SL4.3', level: 'SL', description: "Measures of central tendency and dispersion (mean, median, mode, IQR, standard deviation, variance); effect of constant changes on data; quartiles of discrete data" },
  { course: 'AI', topic: 4, code: 'SL4.4', level: 'SL', description: "Linear correlation of bivariate data; Pearson's product-moment correlation coefficient r; scatter diagrams; regression line of y on x" },
  { course: 'AI', topic: 4, code: 'SL4.5', level: 'SL', description: "Concepts of trial, outcome, sample space, event; probability of an event; expected number of occurrences" },
  { course: 'AI', topic: 4, code: 'SL4.6', level: 'SL', description: "Venn/tree/sample space diagrams and tables of outcomes; combined, mutually exclusive, conditional, independent events" },
  { course: 'AI', topic: 4, code: 'SL4.7', level: 'SL', description: "Discrete random variables and their probability distributions; expected value (mean)" },
  { course: 'AI', topic: 4, code: 'SL4.8', level: 'SL', description: "Binomial distribution; mean and variance of the binomial distribution" },
  { course: 'AI', topic: 4, code: 'SL4.9', level: 'SL', description: "Normal distribution and curve; normal and inverse normal probability calculations" },
  { course: 'AI', topic: 4, code: 'SL4.10', level: 'SL', description: "Spearman's rank correlation coefficient rs; appropriateness/limitations of Pearson's r vs. Spearman's rs, effect of outliers on each" },
  { course: 'AI', topic: 4, code: 'SL4.11', level: 'SL', description: "Hypothesis testing — null/alternative hypotheses, significance levels, p-values, χ² test for independence, χ² goodness of fit test, t-test for comparing two population means" },
  { course: 'AI', topic: 4, code: 'AHL4.12', level: 'AHL', description: "Design of valid data collection methods (surveys/questionnaires); selecting/categorizing variables for χ²; reliability and validity tests" },
  { course: 'AI', topic: 4, code: 'AHL4.13', level: 'AHL', description: "Non-linear regression (linear, quadratic, cubic, exponential, power, sine); sum of square residuals; coefficient of determination (R²)" },
  { course: 'AI', topic: 4, code: 'AHL4.14', level: 'AHL', description: "Linear transformation of a random variable; expected value/variance of linear combinations of n random variables; unbiased estimators of μ and σ²" },
  { course: 'AI', topic: 4, code: 'AHL4.15', level: 'AHL', description: "Linear combinations of independent normal random variables; central limit theorem" },
  { course: 'AI', topic: 4, code: 'AHL4.16', level: 'AHL', description: "Confidence intervals for the mean of a normal population" },
  { course: 'AI', topic: 4, code: 'AHL4.17', level: 'AHL', description: "Poisson distribution, its mean and variance; sum of two independent Poisson distributions" },
  { course: 'AI', topic: 4, code: 'AHL4.18', level: 'AHL', description: "Critical values and critical regions; tests for population mean (normal/Poisson) and proportion (binomial); hypothesis test for population correlation coefficient ρ = 0; Type I and Type II errors" },
  { course: 'AI', topic: 4, code: 'AHL4.19', level: 'AHL', description: "Transition matrices; powers of transition matrices; regular Markov chains; steady-state and long-term probabilities" },

  // --- AI Topic 5: Calculus ---
  { course: 'AI', topic: 5, code: 'SL5.1', level: 'SL', description: "Concept of a limit; derivative interpreted as gradient function and rate of change" },
  { course: 'AI', topic: 5, code: 'SL5.2', level: 'SL', description: "Increasing/decreasing functions; graphical interpretation of f'(x) > 0, = 0, < 0" },
  { course: 'AI', topic: 5, code: 'SL5.3', level: 'SL', description: "Derivative of f(x) = axⁿ (integer n); derivatives of polynomial-type functions" },
  { course: 'AI', topic: 5, code: 'SL5.4', level: 'SL', description: "Tangents and normals at a given point, and their equations" },
  { course: 'AI', topic: 5, code: 'SL5.5', level: 'SL', description: "Integration as anti-differentiation (integer n ≠ −1); boundary condition to determine the constant term; definite integrals using technology; area of a region enclosed by y = f(x) and the x-axis where f(x) > 0" },
  { course: 'AI', topic: 5, code: 'SL5.6', level: 'SL', description: "Values of x where the gradient is zero; solving f'(x) = 0; local maximum and minimum points" },
  // NOTE: AI explicitly EXCLUDES kinematics at SL — see AHL5.13 / AHL3.12.
  { course: 'AI', topic: 5, code: 'SL5.7', level: 'SL', description: "Optimisation problems in context (kinematics explicitly excluded at SL)" },
  { course: 'AI', topic: 5, code: 'SL5.8', level: 'SL', description: "Approximating areas using the trapezoidal rule" },
  // NOTE: AI's AHL5.9 is DERIVATIVE RULES — it is NOT kinematics, and AA has no AHL5.9.
  { course: 'AI', topic: 5, code: 'AHL5.9', level: 'AHL', description: "Derivatives of sin x, cos x, tan x, eˣ, ln x, xⁿ (rational n); chain rule, product rule, quotient rule; related rates of change" },
  { course: 'AI', topic: 5, code: 'AHL5.10', level: 'AHL', description: "The second derivative; second derivative test to distinguish max/min; concavity and points of inflexion" },
  { course: 'AI', topic: 5, code: 'AHL5.11', level: 'AHL', description: "Definite and indefinite integration of xⁿ (rational n, including n = −1), sin x, cos x, sec²x, eˣ; integration by inspection or substitution" },
  { course: 'AI', topic: 5, code: 'AHL5.12', level: 'AHL', description: "Area enclosed by a curve and the x- or y-axis, including negative integrals; volumes of revolution about the x- or y-axis" },
  // NOTE: AI kinematics lives here (calculus route). In AA, AHL5.13 is L'Hopital's rule.
  { course: 'AI', topic: 5, code: 'AHL5.13', level: 'AHL', description: "Kinematic problems — displacement, velocity, acceleration; total distance travelled" },
  { course: 'AI', topic: 5, code: 'AHL5.14', level: 'AHL', description: "Setting up a differential equation/model from context; solving by separation of variables" },
  { course: 'AI', topic: 5, code: 'AHL5.15', level: 'AHL', description: "Slope fields and their diagrams" },
  { course: 'AI', topic: 5, code: 'AHL5.16', level: 'AHL', description: "Euler's method for first-order differential equations; numerical solution of coupled first-order systems" },
  { course: 'AI', topic: 5, code: 'AHL5.17', level: 'AHL', description: "Phase portraits for coupled linear differential equations; qualitative analysis by eigenvalue type (equilibrium points, stability, saddle points)" },
  { course: 'AI', topic: 5, code: 'AHL5.18', level: 'AHL', description: "Solving second-order differential equations via Euler's method, written as a coupled first-order system" },
];

// --- Indexes -------------------------------------------------------------
// Keyed by `${course}:${code}` precisely BECAUSE codes are not globally unique.

const BY_COURSE_CODE = new Map(TAXONOMY.map((e) => [`${e.course}:${e.code}`, e]));

/** True for a syllabus code in the additional-higher-level part of a course. */
export function isAHLCode(code) {
  return typeof code === 'string' && code.startsWith('AHL');
}

/** Look up one entry. Course is REQUIRED — a code alone is ambiguous. */
export function findSubtopic(course, code) {
  return BY_COURSE_CODE.get(`${course}:${code}`);
}

/** Does this code exist in this course at all? (AA has no AHL5.9, for example.) */
export function codeExistsInCourse(course, code) {
  return BY_COURSE_CODE.has(`${course}:${code}`);
}

/**
 * Sub-topics a student at `studentLevel` may be examined on.
 * SL students -> SL entries ONLY. HL students -> SL + AHL.
 * This is the §2.3 guarantee expressed as data, not UI convenience.
 */
export function subtopicsFor(course, studentLevel, { topic } = {}) {
  return TAXONOMY.filter(
    (e) =>
      e.course === course &&
      (studentLevel === 'HL' || e.level === 'SL') &&
      (topic == null || e.topic === topic)
  );
}

/** Same as subtopicsFor, grouped by topic — the shape the picker UI wants. */
export function subtopicsByTopic(course, studentLevel) {
  const entries = subtopicsFor(course, studentLevel);
  return TOPICS.map((t) => ({
    ...t,
    subtopics: entries.filter((e) => e.topic === t.number),
  })).filter((t) => t.subtopics.length > 0);
}

/** Topic display name for a topic number. */
export function topicName(number) {
  return TOPICS.find((t) => t.number === number)?.name;
}

// --- Integrity check (runs at import; catches transcription slips) ---------
{
  const seen = new Set();
  for (const e of TAXONOMY) {
    const key = `${e.course}:${e.code}`;
    if (seen.has(key)) throw new Error(`taxonomy: duplicate entry ${key}`);
    seen.add(key);
    if (!COURSES.includes(e.course)) throw new Error(`taxonomy: bad course ${e.course}`);
    if (e.level !== 'SL' && e.level !== 'AHL') throw new Error(`taxonomy: bad level on ${key}`);
    if (isAHLCode(e.code) !== (e.level === 'AHL')) {
      throw new Error(`taxonomy: code/level mismatch on ${key}`);
    }
    if (!TOPICS.some((t) => t.number === e.topic)) throw new Error(`taxonomy: bad topic on ${key}`);
  }
}
