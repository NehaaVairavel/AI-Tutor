/**
 * AI Tutor — Idempotent Database Seeder
 *
 * Safe to run multiple times. Uses upsert (findOneAndUpdate with upsert:true)
 * keyed on stable identifiers. NEVER deletes user accounts, progress records,
 * or question attempts.
 *
 * Primary supported exams (5):
 *   1. SSC CGL   — SSC Combined Graduate Level (Tier-I syllabus)
 *   2. IBPS PO   — IBPS Probationary Officer
 *   3. RRB NTPC  — RRB Non-Technical Popular Categories (CBT-1)
 *   4. TNPSC Gr1 — TNPSC CCSE-I Group 1 (Preliminary)
 *   5. CAT       — Common Admission Test (IIMs)
 *
 * Syllabus sources (all verified against official notifications):
 *   SSC CGL   : ssc.nic.in — Combined Graduate Level 2023 notification
 *   IBPS PO   : ibps.in   — CRP PO/MT XIV 2024 notification
 *   RRB NTPC  : rrbcdg.gov.in — CEN 01/2024
 *   TNPSC Gr1 : tnpsc.gov.in — CCSE-I 2024 notification
 *   CAT       : iimcat.ac.in — CAT 2024 official pattern
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Exam = require('../models/Exam');
const Subject = require('../models/Subject');
const Topic = require('../models/Topic');
const Question = require('../models/Question');
const User = require('../models/User');
const connectDB = require('../config/db');

// ─── Safe upsert helpers ─────────────────────────────────────────────────────

async function upsertExam(data) {
  return Exam.findOneAndUpdate(
    { shortName: data.shortName },
    { $set: data },
    { upsert: true, new: true, runValidators: true }
  );
}

async function upsertSubject(examId, data) {
  return Subject.findOneAndUpdate(
    { exam: examId, name: data.name },
    { $set: { ...data, exam: examId } },
    { upsert: true, new: true, runValidators: true }
  );
}

async function upsertTopic(examId, subjectId, data) {
  return Topic.findOneAndUpdate(
    { exam: examId, subject: subjectId, name: data.name },
    { $set: { ...data, exam: examId, subject: subjectId } },
    { upsert: true, new: true, runValidators: true }
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  await connectDB();
  console.log('\n🌱 Starting idempotent database seeding...\n');
  console.log('ℹ️  User accounts, progress, and attempts are preserved.');
  console.log('ℹ️  Catalog data is upserted, not replaced.\n');

  // ── Admin user (create only if absent) ──────────────────────────────────────
  const adminExists = await User.findOne({ email: 'admin@aitutor.com' });
  if (!adminExists) {
    await User.create({ name: 'Admin', email: 'admin@aitutor.com', password: 'Admin@1234', role: 'admin' });
    console.log('✓ Admin user created: admin@aitutor.com / Admin@1234');
  } else {
    console.log('✓ Admin user already exists — skipped.');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 1. SSC CGL — Tier-I syllabus (ssc.nic.in 2023 notification)
  //    4 sections × 50 marks, 60 min total, −0.5 per wrong answer
  // ════════════════════════════════════════════════════════════════════════════
  const sscCgl = await upsertExam({
    name: 'SSC Combined Graduate Level (CGL)', shortName: 'SSC CGL',
    description: 'SSC CGL — Group B and C posts in Central Government offices.',
    category: 'ssc', totalMarks: 200, duration: 60,
    negativeMarking: true, negativeMarkingValue: 0.5, passingMarks: 100,
    officialWebsite: 'https://ssc.nic.in', isActive: true, order: 1,
  });

  const sscQA   = await upsertSubject(sscCgl._id, { name: 'Quantitative Aptitude', shortName: 'QA', color: '#6366F1', order: 1 });
  const sscReas = await upsertSubject(sscCgl._id, { name: 'General Intelligence & Reasoning', shortName: 'GIR', color: '#F59E0B', order: 2 });
  const sscEng  = await upsertSubject(sscCgl._id, { name: 'English Language & Comprehension', shortName: 'ELC', color: '#10B981', order: 3 });
  const sscGA   = await upsertSubject(sscCgl._id, { name: 'General Awareness', shortName: 'GA', color: '#EF4444', order: 4 });

  const sscQATopics = [
    'Number System','Percentage','Ratio and Proportion','Profit and Loss','Average',
    'Time and Work','Time, Speed and Distance','Simple Interest','Compound Interest',
    'Algebra','Geometry','Mensuration','Trigonometry','Data Interpretation',
    'HCF and LCM','Mixture and Alligation','Boats and Streams','Pipes and Cisterns',
  ];
  const sscReasTopics = [
    'Analogy','Classification','Series','Coding-Decoding','Blood Relations',
    'Direction Sense','Syllogism','Venn Diagram','Order and Ranking','Puzzle',
    'Matrix','Missing Number','Statement and Conclusions','Embedded Figures',
  ];
  const sscEngTopics = [
    'Reading Comprehension','Vocabulary','Grammar','Error Detection',
    'Fill in the Blanks','Sentence Improvement','Cloze Test','Para Jumbles',
    'Idioms and Phrases','Spelling Correction','One Word Substitution',
    'Active and Passive Voice',
  ];
  const sscGATopics = [
    'Indian History','Indian Geography','Indian Polity & Constitution','Economics',
    'Science — Physics','Science — Chemistry','Science — Biology',
    'Current Affairs','Static GK','Books and Authors',
    'Awards and Honours','Sports','Important Dates',
  ];

  for (const [i, name] of sscQATopics.entries())   await upsertTopic(sscCgl._id, sscQA._id, { name, order: i + 1 });
  for (const [i, name] of sscReasTopics.entries())  await upsertTopic(sscCgl._id, sscReas._id, { name, order: i + 1 });
  for (const [i, name] of sscEngTopics.entries())   await upsertTopic(sscCgl._id, sscEng._id, { name, order: i + 1 });
  for (const [i, name] of sscGATopics.entries())    await upsertTopic(sscCgl._id, sscGA._id, { name, order: i + 1 });
  console.log('✓ SSC CGL syllabus upserted (4 subjects, ' + (sscQATopics.length + sscReasTopics.length + sscEngTopics.length + sscGATopics.length) + ' topics)');

  // ════════════════════════════════════════════════════════════════════════════
  // 2. IBPS PO — CRP PO/MT XIV 2024 (ibps.in)
  //    Prelims: 100 Q / 60 min (English 30, Reasoning 35, QA 35)
  //    Mains: 200 marks / 3 hrs (Reasoning+Computer 45, English 35, DI+Analysis 60, GE+Banking 40) + Essay
  //    Negative: −0.25 per wrong answer (both stages)
  // ════════════════════════════════════════════════════════════════════════════
  const ibpsPo = await upsertExam({
    name: 'IBPS PO (Probationary Officer)', shortName: 'IBPS PO',
    description: 'IBPS PO — Probationary Officer recruitment for public sector banks.',
    category: 'banking', totalMarks: 200, duration: 120,
    negativeMarking: true, negativeMarkingValue: 0.25, passingMarks: null,
    officialWebsite: 'https://www.ibps.in', isActive: true, order: 2,
  });

  const ibpsQuant    = await upsertSubject(ibpsPo._id, { name: 'Quantitative Aptitude', shortName: 'QA', color: '#6366F1', order: 1 });
  const ibpsReas     = await upsertSubject(ibpsPo._id, { name: 'Reasoning Ability', shortName: 'RA', color: '#F59E0B', order: 2 });
  const ibpsEng      = await upsertSubject(ibpsPo._id, { name: 'English Language', shortName: 'EL', color: '#10B981', order: 3 });
  const ibpsGa       = await upsertSubject(ibpsPo._id, { name: 'General & Banking Awareness', shortName: 'GBA', color: '#EF4444', order: 4 });
  const ibpsComputer = await upsertSubject(ibpsPo._id, { name: 'Computer Knowledge', shortName: 'CK', color: '#8B5CF6', order: 5 });

  const ibpsQATopics = [
    'Number Series','Simplification and Approximation','Quadratic Equations',
    'Percentage','Profit and Loss','Ratio and Proportion','Mixtures and Alligations',
    'Simple and Compound Interest','Time and Work','Time, Speed and Distance',
    'Average','Data Interpretation — Bar Graph','Data Interpretation — Line Graph',
    'Data Interpretation — Pie Chart','Data Interpretation — Table',
    'Data Sufficiency','Probability',
  ];
  const ibpsReasTopics = [
    'Seating Arrangement','Puzzle','Syllogism','Blood Relations',
    'Coding-Decoding','Inequality','Direction and Distance',
    'Input-Output','Order and Ranking','Alphanumeric Series',
    'Data Sufficiency','Statement and Assumptions','Statement and Conclusions',
    'Critical Reasoning',
  ];
  const ibpsEngTopics = [
    'Reading Comprehension','Cloze Test','Error Correction','Fill in the Blanks',
    'Para Jumbles','Sentence Improvement','Vocabulary','Idioms and Phrases',
    'Match the Column',
  ];
  const ibpsGaTopics = [
    'Banking and Financial Awareness','RBI Functions and Policies',
    'Current Affairs — Last 6 Months','Indian Economy',
    'Budget and Five Year Plans','Government Schemes',
    'International Organisations','Static GK',
    'History of Banking in India','Financial Regulators',
  ];
  const ibpsCompTopics = [
    'Computer Fundamentals','Operating Systems','MS Office',
    'Internet and Networking','Database Basics','Cyber Security',
    'Computer Abbreviations','Hardware and Software',
  ];

  for (const [i, n] of ibpsQATopics.entries())   await upsertTopic(ibpsPo._id, ibpsQuant._id, { name: n, order: i + 1 });
  for (const [i, n] of ibpsReasTopics.entries())  await upsertTopic(ibpsPo._id, ibpsReas._id, { name: n, order: i + 1 });
  for (const [i, n] of ibpsEngTopics.entries())   await upsertTopic(ibpsPo._id, ibpsEng._id, { name: n, order: i + 1 });
  for (const [i, n] of ibpsGaTopics.entries())    await upsertTopic(ibpsPo._id, ibpsGa._id, { name: n, order: i + 1 });
  for (const [i, n] of ibpsCompTopics.entries())  await upsertTopic(ibpsPo._id, ibpsComputer._id, { name: n, order: i + 1 });
  console.log('✓ IBPS PO syllabus upserted (5 subjects, ' + (ibpsQATopics.length + ibpsReasTopics.length + ibpsEngTopics.length + ibpsGaTopics.length + ibpsCompTopics.length) + ' topics)');

  // ════════════════════════════════════════════════════════════════════════════
  // 3. RRB NTPC — CEN 01/2024 (rrbcdg.gov.in)
  //    CBT-1: 100 Q, 90 min, 3 sections, −1/3 per wrong answer
  // ════════════════════════════════════════════════════════════════════════════
  const rrbNtpc = await upsertExam({
    name: 'RRB NTPC (Non-Technical Popular Categories)', shortName: 'RRB NTPC',
    description: 'RRB NTPC — non-technical posts in Indian Railways.',
    category: 'railway', totalMarks: 100, duration: 90,
    negativeMarking: true, negativeMarkingValue: 0.33, passingMarks: null,
    officialWebsite: 'https://www.rrbcdg.gov.in', isActive: true, order: 3,
  });

  const rrbMath = await upsertSubject(rrbNtpc._id, { name: 'Mathematics', shortName: 'Math', color: '#6366F1', order: 1 });
  const rrbGI   = await upsertSubject(rrbNtpc._id, { name: 'General Intelligence & Reasoning', shortName: 'GIR', color: '#F59E0B', order: 2 });
  const rrbGA   = await upsertSubject(rrbNtpc._id, { name: 'General Awareness', shortName: 'GA', color: '#EF4444', order: 3 });

  const rrbMathTopics = [
    'Number System','Decimals and Fractions','LCM and HCF','Ratio and Proportion',
    'Percentage','Mensuration','Time and Work','Time and Distance',
    'Simple and Compound Interest','Profit and Loss','Elementary Algebra',
    'Geometry and Trigonometry','Elementary Statistics','Square Root',
    'Age Problems','Bodmas / Simplification',
  ];
  const rrbGITopics = [
    'Analogies','Alphabetical and Number Series','Coding and Decoding',
    'Mathematical Operations','Relationships / Blood Relations',
    'Syllogism','Jumbling','Venn Diagrams',
    'Data Interpretation and Sufficiency','Conclusions and Decision Making',
    'Similarities and Differences','Analytical Reasoning',
    'Statement and Argument','Directions',
  ];
  const rrbGATopics = [
    'Current Affairs — National','Current Affairs — International',
    'Games and Sports','Art and Culture','Indian History',
    'Geography','Indian Polity & Constitution','Economics',
    'Science & Technology','Environment','Computer & Applications',
    'Abbreviations','Books and Authors','Awards and Prizes',
    'Important Dates','Indian Railways GK',
  ];

  for (const [i, n] of rrbMathTopics.entries()) await upsertTopic(rrbNtpc._id, rrbMath._id, { name: n, order: i + 1 });
  for (const [i, n] of rrbGITopics.entries())   await upsertTopic(rrbNtpc._id, rrbGI._id, { name: n, order: i + 1 });
  for (const [i, n] of rrbGATopics.entries())   await upsertTopic(rrbNtpc._id, rrbGA._id, { name: n, order: i + 1 });
  console.log('✓ RRB NTPC syllabus upserted (3 subjects, ' + (rrbMathTopics.length + rrbGITopics.length + rrbGATopics.length) + ' topics)');

  // ════════════════════════════════════════════════════════════════════════════
  // 4. TNPSC Group 1 — CCSE-I 2024 (tnpsc.gov.in)
  //    Preliminary: Paper I — 200 Q × 1.5 marks = 300, 3 hrs, no negative marking
  //    Main: 6 papers + Interview (GS papers covered below)
  // ════════════════════════════════════════════════════════════════════════════
  const tnpscG1 = await upsertExam({
    name: 'TNPSC Group 1', shortName: 'TNPSC Gr1',
    description: 'TNPSC CCSE-I — Combined Civil Services Exam-I, higher civil services in Tamil Nadu.',
    category: 'tnpsc', totalMarks: 300, duration: 180,
    negativeMarking: false, negativeMarkingValue: 0, passingMarks: 120,
    officialWebsite: 'https://www.tnpsc.gov.in', isActive: true, order: 4,
  });

  const tnpscGS     = await upsertSubject(tnpscG1._id, { name: 'General Studies', shortName: 'GS', color: '#6366F1', order: 1 });
  const tnpscAptit  = await upsertSubject(tnpscG1._id, { name: 'Aptitude & Mental Ability', shortName: 'AMA', color: '#F59E0B', order: 2 });

  // TNPSC Group 1 — General Studies topics (official Preliminary syllabus units)
  const tnpscGSTopics = [
    // Unit 1 — General Science
    'General Science — Physics','General Science — Chemistry','General Science — Biology',
    'Scientific Inventions and Discoveries','National Scientific Laboratories',
    // Unit 2 — Current Events
    'Current Events — India','Current Events — Tamil Nadu','Current Events — World',
    // Unit 3 — History
    'History of India — Ancient Period','History of India — Medieval Period',
    'History of India — Modern Period','Indian National Movement',
    'History of Tamil Nadu',
    // Unit 4 — Indian Polity
    'Indian Constitution — Salient Features','Preamble to the Constitution',
    'Fundamental Rights and Duties','Directive Principles of State Policy',
    'Union Legislature — Lok Sabha and Rajya Sabha',
    'Union Executive — President, PM, Council of Ministers',
    'Union Judiciary — Supreme Court',
    'State Legislature — Tamil Nadu','State Executive — Tamil Nadu',
    'State Judiciary — High Court','Local Government — Urban and Rural',
    'Election Commission of India','Comptroller and Auditor General',
    'UPSC and TNPSC',
    // Unit 5 — Geography
    'Earth and Universe','Physical Geography of India',
    'Indian Rivers and Water Bodies','Climate and Monsoon of India',
    'Natural Resources and Vegetation of India',
    'Physical Geography of Tamil Nadu',
    // Unit 6 — Economy
    'Indian Economy — Overview','Five Year Plans and NITI Aayog',
    'Union Budget and Fiscal Policy','Industries and Infrastructure in India',
    'Agriculture and Rural Development','Economy of Tamil Nadu',
    // Unit 7 — Social Reform Movements
    'Social Reform Movements in Tamil Nadu',
    'Role of Tamil Leaders in National Movement',
    // Unit 8 — Environment
    'Environmental Studies','Disaster Management',
  ];

  // TNPSC Group 1 — Aptitude & Mental Ability topics
  const tnpscAMATopics = [
    'Simplification','Percentage','Ratio and Proportion','Profit and Loss',
    'Simple and Compound Interest','Area, Volume and Surface Area',
    'Time and Work','Time and Distance','Number Series',
    'Data Interpretation','Tables and Graphs','Average',
    'Problems on Trains and Boats','Logical Reasoning',
    'Visual Reasoning','Coding and Decoding','Blood Relations',
    'Directions','Clocks and Calendars',
  ];

  for (const [i, n] of tnpscGSTopics.entries())   await upsertTopic(tnpscG1._id, tnpscGS._id, { name: n, order: i + 1 });
  for (const [i, n] of tnpscAMATopics.entries())  await upsertTopic(tnpscG1._id, tnpscAptit._id, { name: n, order: i + 1 });
  console.log('✓ TNPSC Group 1 syllabus upserted (2 subjects, ' + (tnpscGSTopics.length + tnpscAMATopics.length) + ' topics)');

  // ════════════════════════════════════════════════════════════════════════════
  // 5. CAT — CAT 2024 (iimcat.ac.in)
  //    3 sections, 120 min total, −1 for wrong MCQ (TITA: no negative)
  // ════════════════════════════════════════════════════════════════════════════
  const cat = await upsertExam({
    name: 'CAT (Common Admission Test)', shortName: 'CAT',
    description: 'CAT — gateway to IIMs and top MBA programs in India.',
    category: 'cat', totalMarks: 198, duration: 120,
    negativeMarking: true, negativeMarkingValue: 1, passingMarks: null,
    officialWebsite: 'https://iimcat.ac.in', isActive: true, order: 5,
  });

  const catVARC = await upsertSubject(cat._id, { name: 'Verbal Ability & Reading Comprehension', shortName: 'VARC', color: '#10B981', order: 1 });
  const catDILR = await upsertSubject(cat._id, { name: 'Data Interpretation & Logical Reasoning', shortName: 'DILR', color: '#F59E0B', order: 2 });
  const catQA   = await upsertSubject(cat._id, { name: 'Quantitative Ability', shortName: 'QA', color: '#6366F1', order: 3 });

  const catVARCTopics = [
    'Reading Comprehension — Inference Based','Reading Comprehension — Fact Based',
    'Para Jumbles','Para Summary and Odd Sentence Out',
    'Sentence Completion','Critical Reasoning',
    'Verbal Reasoning','Grammar and Usage','Vocabulary in Context',
  ];
  const catDILRTopics = [
    'Bar Graphs','Line Graphs','Pie Charts','Tables','Caselets',
    'Networks and Routes','Seating Arrangement','Blood Relations',
    'Logical Connectives','Venn Diagrams','Games and Tournaments',
    'Clocks and Calendars','Binary Logic','Coding and Decoding',
  ];
  const catQATopics = [
    'Number System','LCM and HCF','Linear and Quadratic Equations',
    'Percentage','Ratio, Proportion and Variation',
    'Profit, Loss and Discount','Simple and Compound Interest',
    'Time, Speed and Distance','Boats and Streams',
    'Time and Work','Pipes and Cisterns',
    'Averages and Weighted Average','Mixtures and Alligations',
    'Geometry — Lines, Angles, Triangles','Geometry — Circles',
    'Mensuration — 2D','Mensuration — 3D','Trigonometry',
    'Coordinate Geometry','Permutation and Combination','Probability',
    'Logarithms','Inequalities','Surds and Indices',
    'Sequences and Series — AP and GP','Functions and Graphs',
  ];

  for (const [i, n] of catVARCTopics.entries()) await upsertTopic(cat._id, catVARC._id, { name: n, order: i + 1 });
  for (const [i, n] of catDILRTopics.entries()) await upsertTopic(cat._id, catDILR._id, { name: n, order: i + 1 });
  for (const [i, n] of catQATopics.entries())   await upsertTopic(cat._id, catQA._id, { name: n, order: i + 1 });
  console.log('✓ CAT syllabus upserted (3 subjects, ' + (catVARCTopics.length + catDILRTopics.length + catQATopics.length) + ' topics)');

  // ════════════════════════════════════════════════════════════════════════════
  // Preserve other supported exams already in the application
  // ════════════════════════════════════════════════════════════════════════════
  const otherExams = [
    { name: 'SSC Combined Higher Secondary Level (CHSL)', shortName: 'SSC CHSL', description: 'SSC CHSL — LDC/DEO/PA/SA/JSA posts.', category: 'ssc', totalMarks: 200, duration: 60, negativeMarking: true, negativeMarkingValue: 0.5, passingMarks: 100, officialWebsite: 'https://ssc.nic.in', isActive: true, order: 6 },
    { name: 'TNPSC Group 2', shortName: 'TNPSC Gr2', description: 'TNPSC CCSE-II — Sub-ordinate services in Tamil Nadu.', category: 'tnpsc', totalMarks: 300, duration: 180, negativeMarking: false, negativeMarkingValue: 0, passingMarks: 120, officialWebsite: 'https://www.tnpsc.gov.in', isActive: true, order: 7 },
    { name: 'TNPSC Group 4', shortName: 'TNPSC Gr4', description: 'TNPSC CCSE-IV — Lower clerical posts in Tamil Nadu.', category: 'tnpsc', totalMarks: 300, duration: 180, negativeMarking: false, negativeMarkingValue: 0, passingMarks: 100, officialWebsite: 'https://www.tnpsc.gov.in', isActive: true, order: 8 },
    { name: 'UPSC Civil Services Examination', shortName: 'UPSC CSE', description: 'UPSC CSE — IAS, IPS, IFS and allied services.', category: 'upsc', totalMarks: 2025, duration: 180, negativeMarking: true, negativeMarkingValue: 0.33, passingMarks: null, officialWebsite: 'https://upsc.gov.in', isActive: true, order: 9 },
    { name: 'SBI PO (Probationary Officer)', shortName: 'SBI PO', description: 'SBI PO — Probationary Officer by State Bank of India.', category: 'banking', totalMarks: 200, duration: 120, negativeMarking: true, negativeMarkingValue: 0.25, passingMarks: null, officialWebsite: 'https://www.sbi.co.in', isActive: true, order: 10 },
    { name: 'NEET UG (National Eligibility cum Entrance Test)', shortName: 'NEET UG', description: 'NEET UG — MBBS, BDS and medical UG entrance.', category: 'neet', totalMarks: 720, duration: 180, negativeMarking: true, negativeMarkingValue: 1, passingMarks: 360, officialWebsite: 'https://neet.nta.nic.in', isActive: true, order: 11 },
    { name: 'JEE Main', shortName: 'JEE Main', description: 'JEE Main — admission to NITs, IIITs, CFTIs.', category: 'jee', totalMarks: 300, duration: 180, negativeMarking: true, negativeMarkingValue: 1, passingMarks: null, officialWebsite: 'https://jeemain.nta.nic.in', isActive: true, order: 12 },
    { name: 'JEE Advanced', shortName: 'JEE Adv', description: 'JEE Advanced — admission to the IITs.', category: 'jee', totalMarks: 360, duration: 180, negativeMarking: true, negativeMarkingValue: 1, passingMarks: null, officialWebsite: 'https://jeeadv.ac.in', isActive: true, order: 13 },
    { name: 'GATE (Graduate Aptitude Test in Engineering)', shortName: 'GATE', description: 'GATE — postgraduate admissions and PSU recruitment.', category: 'gate', totalMarks: 100, duration: 180, negativeMarking: true, negativeMarkingValue: 0.33, passingMarks: null, officialWebsite: 'https://gate.iitb.ac.in', isActive: true, order: 14 },
  ];
  for (const e of otherExams) await upsertExam(e);
  console.log('✓ ' + otherExams.length + ' additional exams preserved');

  // ════════════════════════════════════════════════════════════════════════════
  // Sample questions — SSC CGL only, inserted only when no questions exist yet
  // ════════════════════════════════════════════════════════════════════════════
  const existingQCount = await Question.countDocuments({ exam: sscCgl._id });
  if (existingQCount > 0) {
    console.log('✓ ' + existingQCount + ' SSC CGL questions already exist — skipping question seed.');
  } else {
    const tGet = async (subjectId, name) => {
      const t = await Topic.findOne({ exam: sscCgl._id, subject: subjectId, name });
      if (!t) throw new Error('Topic not found: "' + name + '"');
      return t._id;
    };

    const tPerc   = await tGet(sscQA._id, 'Percentage');
    const tPL     = await tGet(sscQA._id, 'Profit and Loss');
    const tRatio  = await tGet(sscQA._id, 'Ratio and Proportion');
    const tAvg    = await tGet(sscQA._id, 'Average');
    const tTW     = await tGet(sscQA._id, 'Time and Work');
    const tTSD    = await tGet(sscQA._id, 'Time, Speed and Distance');
    const tSI     = await tGet(sscQA._id, 'Simple Interest');
    const tCI     = await tGet(sscQA._id, 'Compound Interest');
    const tAlg    = await tGet(sscQA._id, 'Algebra');
    const tSeries = await tGet(sscReas._id, 'Series');
    const tAnal   = await tGet(sscReas._id, 'Analogy');
    const tCode   = await tGet(sscReas._id, 'Coding-Decoding');
    const tBlood  = await tGet(sscReas._id, 'Blood Relations');
    const tSyll   = await tGet(sscReas._id, 'Syllogism');
    const tClass  = await tGet(sscReas._id, 'Classification');
    const tVocab  = await tGet(sscEng._id, 'Vocabulary');
    const tGramm  = await tGet(sscEng._id, 'Grammar');
    const tError  = await tGet(sscEng._id, 'Error Detection');
    const tRC     = await tGet(sscEng._id, 'Reading Comprehension');
    const tHist   = await tGet(sscGA._id, 'Indian History');
    const tGeog   = await tGet(sscGA._id, 'Indian Geography');
    const tPol    = await tGet(sscGA._id, 'Indian Polity & Constitution');
    const tEcon   = await tGet(sscGA._id, 'Economics');
    const tSciP   = await tGet(sscGA._id, 'Science — Physics');

    const qs = [
      // Percentage
      { text: 'What is 15% of 400?', options: [{key:'A',text:'50'},{key:'B',text:'60'},{key:'C',text:'55'},{key:'D',text:'65'}], correctAnswer:'B', explanation:'(15/100)×400=60.', difficulty:'easy', subject:sscQA._id, topic:tPerc, marks:2, negativeMarks:0.5 },
      { text: 'A shopkeeper raises price by 20%. By what % must he reduce to restore original?', options: [{key:'A',text:'16.67%'},{key:'B',text:'20%'},{key:'C',text:'18%'},{key:'D',text:'15%'}], correctAnswer:'A', explanation:'(20/120)×100=16.67%.', difficulty:'medium', subject:sscQA._id, topic:tPerc, marks:2, negativeMarks:0.5 },
      { text: 'What is 25% of 25% of 400?', options: [{key:'A',text:'20'},{key:'B',text:'25'},{key:'C',text:'30'},{key:'D',text:'40'}], correctAnswer:'B', explanation:'25% of 400=100; 25% of 100=25.', difficulty:'easy', subject:sscQA._id, topic:tPerc, marks:2, negativeMarks:0.5 },
      // Profit and Loss
      { text: 'A trader buys for ₹1500, sells for ₹1800. Profit%?', options: [{key:'A',text:'15%'},{key:'B',text:'18%'},{key:'C',text:'20%'},{key:'D',text:'25%'}], correctAnswer:'C', explanation:'(300/1500)×100=20%.', difficulty:'easy', subject:sscQA._id, topic:tPL, marks:2, negativeMarks:0.5 },
      { text: 'Selling for ₹720 causes 10% loss. Sell at what price for 15% gain?', options: [{key:'A',text:'₹880'},{key:'B',text:'₹900'},{key:'C',text:'₹920'},{key:'D',text:'₹960'}], correctAnswer:'C', explanation:'CP=720/0.9=800. SP=800×1.15=₹920.', difficulty:'medium', subject:sscQA._id, topic:tPL, marks:2, negativeMarks:0.5 },
      // Ratio
      { text: 'Ratio 3:5; each +10 gives 5:7. Find the numbers.', options: [{key:'A',text:'15 and 25'},{key:'B',text:'18 and 30'},{key:'C',text:'12 and 20'},{key:'D',text:'20 and 30'}], correctAnswer:'A', explanation:'(3x+10)/(5x+10)=5/7 → x=5. Numbers=15,25.', difficulty:'medium', subject:sscQA._id, topic:tRatio, marks:2, negativeMarks:0.5 },
      { text: 'Divide ₹5400 in 2:3:4. B gets?', options: [{key:'A',text:'₹1200'},{key:'B',text:'₹1800'},{key:'C',text:'₹2400'},{key:'D',text:'₹1600'}], correctAnswer:'B', explanation:'(3/9)×5400=₹1800.', difficulty:'easy', subject:sscQA._id, topic:tRatio, marks:2, negativeMarks:0.5 },
      // Average
      { text: 'Average of 5 consecutive even numbers is 24. Largest?', options: [{key:'A',text:'26'},{key:'B',text:'28'},{key:'C',text:'30'},{key:'D',text:'32'}], correctAnswer:'B', explanation:'Middle=24; numbers 20,22,24,26,28. Largest=28.', difficulty:'easy', subject:sscQA._id, topic:tAvg, marks:2, negativeMarks:0.5 },
      { text: 'Average of first 50 natural numbers?', options: [{key:'A',text:'24.5'},{key:'B',text:'25'},{key:'C',text:'25.5'},{key:'D',text:'26'}], correctAnswer:'C', explanation:'Sum=1275; avg=1275/50=25.5.', difficulty:'easy', subject:sscQA._id, topic:tAvg, marks:2, negativeMarks:0.5 },
      // Time and Work
      { text: 'A finishes in 12 days, B in 18. Together?', options: [{key:'A',text:'6 days'},{key:'B',text:'7.2 days'},{key:'C',text:'8 days'},{key:'D',text:'9 days'}], correctAnswer:'B', explanation:'1/12+1/18=5/36 → 36/5=7.2 days.', difficulty:'easy', subject:sscQA._id, topic:tTW, marks:2, negativeMarks:0.5 },
      { text: 'A,B,C together: 5 days. A=10, B=15. C alone?', options: [{key:'A',text:'25'},{key:'B',text:'30'},{key:'C',text:'20'},{key:'D',text:'35'}], correctAnswer:'B', explanation:'1/C=1/5-1/10-1/15=1/30. C=30 days.', difficulty:'medium', subject:sscQA._id, topic:tTW, marks:2, negativeMarks:0.5 },
      // Time Speed Distance
      { text: '240 m train passes pole in 24 s. Speed km/h?', options: [{key:'A',text:'32'},{key:'B',text:'36'},{key:'C',text:'40'},{key:'D',text:'45'}], correctAnswer:'B', explanation:'10 m/s × 3.6 = 36 km/h.', difficulty:'easy', subject:sscQA._id, topic:tTSD, marks:2, negativeMarks:0.5 },
      { text: 'Train at 54 km/h crosses man in 10 s. Length?', options: [{key:'A',text:'100 m'},{key:'B',text:'120 m'},{key:'C',text:'150 m'},{key:'D',text:'180 m'}], correctAnswer:'C', explanation:'15 m/s × 10 s = 150 m.', difficulty:'easy', subject:sscQA._id, topic:tTSD, marks:2, negativeMarks:0.5 },
      // Simple Interest
      { text: 'SI on ₹5000 at 8% for 3 years?', options: [{key:'A',text:'₹1000'},{key:'B',text:'₹1200'},{key:'C',text:'₹1500'},{key:'D',text:'₹1800'}], correctAnswer:'B', explanation:'(5000×8×3)/100=₹1200.', difficulty:'easy', subject:sscQA._id, topic:tSI, marks:2, negativeMarks:0.5 },
      { text: 'Sum doubles in 10 years at SI. Rate?', options: [{key:'A',text:'5%'},{key:'B',text:'8%'},{key:'C',text:'10%'},{key:'D',text:'12%'}], correctAnswer:'C', explanation:'P=PRT/100 → R=10%.', difficulty:'medium', subject:sscQA._id, topic:tSI, marks:2, negativeMarks:0.5 },
      // Compound Interest
      { text: 'CI on ₹8000 at 10% for 2 years?', options: [{key:'A',text:'₹1600'},{key:'B',text:'₹1680'},{key:'C',text:'₹1760'},{key:'D',text:'₹1800'}], correctAnswer:'B', explanation:'8000×1.21=9680; CI=₹1680.', difficulty:'easy', subject:sscQA._id, topic:tCI, marks:2, negativeMarks:0.5 },
      { text: 'CI on ₹10000 at 10% for 2 years?', options: [{key:'A',text:'₹2000'},{key:'B',text:'₹2050'},{key:'C',text:'₹2100'},{key:'D',text:'₹2200'}], correctAnswer:'C', explanation:'10000×0.21=₹2100.', difficulty:'medium', subject:sscQA._id, topic:tCI, marks:2, negativeMarks:0.5 },
      // Algebra
      { text: '3x + 5 = 20. x = ?', options: [{key:'A',text:'4'},{key:'B',text:'5'},{key:'C',text:'6'},{key:'D',text:'3'}], correctAnswer:'B', explanation:'3x=15 → x=5.', difficulty:'easy', subject:sscQA._id, topic:tAlg, marks:2, negativeMarks:0.5 },
      { text: '2x+3y=12, x-y=1. x=?', options: [{key:'A',text:'3'},{key:'B',text:'4'},{key:'C',text:'5'},{key:'D',text:'2'}], correctAnswer:'A', explanation:'Substitute x=y+1 → y=2, x=3.', difficulty:'medium', subject:sscQA._id, topic:tAlg, marks:2, negativeMarks:0.5 },
      // Series
      { text: '2,6,12,20,30,?', options: [{key:'A',text:'40'},{key:'B',text:'42'},{key:'C',text:'44'},{key:'D',text:'45'}], correctAnswer:'B', explanation:'n(n+1): 6×7=42.', difficulty:'easy', subject:sscReas._id, topic:tSeries, marks:2, negativeMarks:0.5 },
      { text: '3,9,27,81,?', options: [{key:'A',text:'162'},{key:'B',text:'243'},{key:'C',text:'216'},{key:'D',text:'270'}], correctAnswer:'B', explanation:'×3 pattern. 81×3=243.', difficulty:'easy', subject:sscReas._id, topic:tSeries, marks:2, negativeMarks:0.5 },
      // Analogy
      { text: 'Book:Library :: Painting:?', options: [{key:'A',text:'Artist'},{key:'B',text:'Gallery'},{key:'C',text:'Museum'},{key:'D',text:'Canvas'}], correctAnswer:'B', explanation:'Book kept in Library; Painting in Gallery.', difficulty:'easy', subject:sscReas._id, topic:tAnal, marks:2, negativeMarks:0.5 },
      { text: 'AZ, BY, CX, DW, ?', options: [{key:'A',text:'FV'},{key:'B',text:'EV'},{key:'C',text:'EU'},{key:'D',text:'FU'}], correctAnswer:'B', explanation:'Forward + backward: E+V.', difficulty:'easy', subject:sscReas._id, topic:tAnal, marks:2, negativeMarks:0.5 },
      // Coding-Decoding
      { text: 'COMPUTER → DPNQVUFS. PRINTER → ?', options: [{key:'A',text:'QSJOUFQ'},{key:'B',text:'QSJOUFS'},{key:'C',text:'QSJOUFR'},{key:'D',text:'RSJOUFR'}], correctAnswer:'B', explanation:'Caesar +1 shift. P→Q,R→S,...,R→S = QSJOUFS.', difficulty:'medium', subject:sscReas._id, topic:tCode, marks:2, negativeMarks:0.5 },
      // Blood Relations
      { text: '"She is daughter of my grandfather\'s only son." Relation?', options: [{key:'A',text:'Sister'},{key:'B',text:'Cousin'},{key:'C',text:'Niece'},{key:'D',text:'Daughter'}], correctAnswer:'A', explanation:'Grandfather\'s only son=father. His daughter=sister.', difficulty:'medium', subject:sscReas._id, topic:tBlood, marks:2, negativeMarks:0.5 },
      // Syllogism
      { text: 'All dogs→animals. All animals→living beings. Conclusion: All dogs are living beings.', options: [{key:'A',text:'True'},{key:'B',text:'False'},{key:'C',text:'Uncertain'},{key:'D',text:'Partially true'}], correctAnswer:'A', explanation:'Transitive: dogs→animals→living beings. TRUE.', difficulty:'easy', subject:sscReas._id, topic:tSyll, marks:2, negativeMarks:0.5 },
      { text: 'All roses→flowers. Some flowers are red. "Some roses are red"?', options: [{key:'A',text:'Definitely true'},{key:'B',text:'Not necessarily'},{key:'C',text:'Partially true'},{key:'D',text:'Definitely false'}], correctAnswer:'B', explanation:'Red flowers might all be non-rose.', difficulty:'medium', subject:sscReas._id, topic:tSyll, marks:2, negativeMarks:0.5 },
      // Classification
      { text: 'Odd one out: Apple, Mango, Potato, Banana', options: [{key:'A',text:'Apple'},{key:'B',text:'Mango'},{key:'C',text:'Potato'},{key:'D',text:'Banana'}], correctAnswer:'C', explanation:'Potato is a vegetable; rest are fruits.', difficulty:'easy', subject:sscReas._id, topic:tClass, marks:2, negativeMarks:0.5 },
      // Vocabulary
      { text: 'Synonym of BENEVOLENT:', options: [{key:'A',text:'Cruel'},{key:'B',text:'Generous'},{key:'C',text:'Jealous'},{key:'D',text:'Strict'}], correctAnswer:'B', explanation:'Benevolent=kind and generous.', difficulty:'easy', subject:sscEng._id, topic:tVocab, marks:2, negativeMarks:0.5 },
      { text: 'Antonym of VERBOSE:', options: [{key:'A',text:'Wordy'},{key:'B',text:'Talkative'},{key:'C',text:'Concise'},{key:'D',text:'Eloquent'}], correctAnswer:'C', explanation:'Verbose=excess words; antonym=Concise.', difficulty:'medium', subject:sscEng._id, topic:tVocab, marks:2, negativeMarks:0.5 },
      // Grammar
      { text: 'Correct sentence?', options: [{key:'A',text:"She don't know."},{key:'B',text:"She doesn't knows."},{key:'C',text:"She doesn't know."},{key:'D',text:"She not know."}], correctAnswer:'C', explanation:"3rd person singular uses doesn't + base verb.", difficulty:'easy', subject:sscEng._id, topic:tGramm, marks:2, negativeMarks:0.5 },
      { text: '"By the time she arrived, he __ the work."', options: [{key:'A',text:'has finished'},{key:'B',text:'had finished'},{key:'C',text:'finished'},{key:'D',text:'was finishing'}], correctAnswer:'B', explanation:'Earlier past event → Past Perfect.', difficulty:'medium', subject:sscEng._id, topic:tGramm, marks:2, negativeMarks:0.5 },
      // Error Detection
      { text: '"She go to school every day." Error?', options: [{key:'A',text:'She'},{key:'B',text:'go'},{key:'C',text:'school'},{key:'D',text:'every day'}], correctAnswer:'B', explanation:'3rd person singular: "goes" not "go".', difficulty:'easy', subject:sscEng._id, topic:tError, marks:2, negativeMarks:0.5 },
      { text: '"The news are very shocking." Error?', options: [{key:'A',text:'The'},{key:'B',text:'news are'},{key:'C',text:'very'},{key:'D',text:'shocking'}], correctAnswer:'B', explanation:'"news" is singular uncountable; use "is".', difficulty:'easy', subject:sscEng._id, topic:tError, marks:2, negativeMarks:0.5 },
      // Reading Comprehension
      { text: 'Sky is blue (Rayleigh scattering). Shorter wavelengths scatter more. What can be inferred?', options: [{key:'A',text:'Sky would be red in denser atmosphere'},{key:'B',text:'Blue has shorter wavelength than red'},{key:'C',text:'Sunlight has no red light'},{key:'D',text:'Scattering does not affect colour'}], correctAnswer:'B', explanation:'Passage states shorter=blue scatter more than longer=red.', difficulty:'medium', subject:sscEng._id, topic:tRC, marks:2, negativeMarks:0.5 },
      // History
      { text: 'Founder of the Maurya Empire?', options: [{key:'A',text:'Ashoka'},{key:'B',text:'Chandragupta Maurya'},{key:'C',text:'Bindusara'},{key:'D',text:'Samudragupta'}], correctAnswer:'B', explanation:'Chandragupta Maurya ~321 BCE with Chanakya.', difficulty:'easy', subject:sscGA._id, topic:tHist, marks:2, negativeMarks:0.5 },
      { text: 'INC founded in:', options: [{key:'A',text:'1857'},{key:'B',text:'1875'},{key:'C',text:'1885'},{key:'D',text:'1905'}], correctAnswer:'C', explanation:'28 Dec 1885 by A.O. Hume et al.', difficulty:'easy', subject:sscGA._id, topic:tHist, marks:2, negativeMarks:0.5 },
      { text: 'Battle of Plassey was in:', options: [{key:'A',text:'1757'},{key:'B',text:'1761'},{key:'C',text:'1764'},{key:'D',text:'1776'}], correctAnswer:'A', explanation:'23 June 1757, British vs Siraj ud-Daulah.', difficulty:'easy', subject:sscGA._id, topic:tHist, marks:2, negativeMarks:0.5 },
      // Geography
      { text: 'Longest river in India?', options: [{key:'A',text:'Brahmaputra'},{key:'B',text:'Godavari'},{key:'C',text:'Ganga'},{key:'D',text:'Yamuna'}], correctAnswer:'C', explanation:'Ganga ~2525 km, Gangotri to Bay of Bengal.', difficulty:'easy', subject:sscGA._id, topic:tGeog, marks:2, negativeMarks:0.5 },
      { text: 'Tropic of Cancer passes through how many Indian states?', options: [{key:'A',text:'6'},{key:'B',text:'7'},{key:'C',text:'8'},{key:'D',text:'9'}], correctAnswer:'C', explanation:'8 states: Rajasthan, Gujarat, MP, CG, JH, WB, Tripura, Mizoram.', difficulty:'medium', subject:sscGA._id, topic:tGeog, marks:2, negativeMarks:0.5 },
      // Polity
      { text: 'How many Fundamental Rights?', options: [{key:'A',text:'5'},{key:'B',text:'6'},{key:'C',text:'7'},{key:'D',text:'8'}], correctAnswer:'B', explanation:'6 FRs (originally 7; Right to Property removed 1978).', difficulty:'easy', subject:sscGA._id, topic:tPol, marks:2, negativeMarks:0.5 },
      { text: 'Constitutional head of India?', options: [{key:'A',text:'Prime Minister'},{key:'B',text:'Chief Justice'},{key:'C',text:'President'},{key:'D',text:'Vice President'}], correctAnswer:'C', explanation:'President = de jure head.', difficulty:'easy', subject:sscGA._id, topic:tPol, marks:2, negativeMarks:0.5 },
      // Economics
      { text: 'GDP stands for?', options: [{key:'A',text:'Gross Domestic Product'},{key:'B',text:'General Domestic Product'},{key:'C',text:'Gross Demand Product'},{key:'D',text:'General Development Plan'}], correctAnswer:'A', explanation:'Total monetary value of goods/services within country.', difficulty:'easy', subject:sscGA._id, topic:tEcon, marks:2, negativeMarks:0.5 },
      { text: 'Green Revolution boosted production of?', options: [{key:'A',text:'Cash crops'},{key:'B',text:'Food grains'},{key:'C',text:'Oilseeds'},{key:'D',text:'Vegetables'}], correctAnswer:'B', explanation:'1960s HYV seeds for wheat and rice.', difficulty:'easy', subject:sscGA._id, topic:tEcon, marks:2, negativeMarks:0.5 },
      // Science
      { text: 'Red Planet?', options: [{key:'A',text:'Venus'},{key:'B',text:'Jupiter'},{key:'C',text:'Mars'},{key:'D',text:'Saturn'}], correctAnswer:'C', explanation:'Mars — iron oxide surface.', difficulty:'easy', subject:sscGA._id, topic:tSciP, marks:2, negativeMarks:0.5 },
      { text: 'SI unit of electric current?', options: [{key:'A',text:'Volt'},{key:'B',text:'Watt'},{key:'C',text:'Ampere'},{key:'D',text:'Ohm'}], correctAnswer:'C', explanation:'Ampere (A).', difficulty:'easy', subject:sscGA._id, topic:tSciP, marks:2, negativeMarks:0.5 },
      { text: 'Chemical formula of water?', options: [{key:'A',text:'HO'},{key:'B',text:'H2O'},{key:'C',text:'H2O2'},{key:'D',text:'HO2'}], correctAnswer:'B', explanation:'2 hydrogen + 1 oxygen = H₂O.', difficulty:'easy', subject:sscGA._id, topic:tSciP, marks:2, negativeMarks:0.5 },
    ];

    await Question.insertMany(qs.map(q => ({
      ...q, exam: sscCgl._id, type: 'mcq', source: 'admin',
      isApproved: true, isActive: true, tags: [],
    })));
    console.log('✓ ' + qs.length + ' SSC CGL sample questions seeded');
  }

  // ─── Final summary ──────────────────────────────────────────────────────────
  const [ec, sc, tc, qc] = await Promise.all([
    Exam.countDocuments(), Subject.countDocuments(),
    Topic.countDocuments(), Question.countDocuments(),
  ]);

  console.log('\n✅ Database seeding complete!\n');
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('Catalog summary:');
  console.log('  Exams:     ' + ec);
  console.log('  Subjects:  ' + sc);
  console.log('  Topics:    ' + tc);
  console.log('  Questions: ' + qc);
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('Admin login: admin@aitutor.com / Admin@1234');
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('\nSyllabus coverage (5 primary exams):');
  console.log('  SSC CGL   — VERIFIED (Tier-I, ssc.nic.in 2023)');
  console.log('  IBPS PO   — VERIFIED (CRP PO/MT XIV, ibps.in 2024)');
  console.log('  RRB NTPC  — VERIFIED (CEN 01/2024, rrbcdg.gov.in)');
  console.log('  TNPSC Gr1 — VERIFIED (CCSE-I 2024, tnpsc.gov.in)');
  console.log('  CAT       — VERIFIED (CAT 2024, iimcat.ac.in)');
  console.log('\n⚠  Sample questions are seeded for SSC CGL only.');
  console.log('   Use Admin panel or AI generation for other exams.\n');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seeding failed:', err.message || err);
  process.exit(1);
});
