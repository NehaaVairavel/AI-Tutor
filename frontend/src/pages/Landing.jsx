import { Link } from 'react-router-dom';
import {
  Brain, BookOpen, Target, BarChart2, CheckCircle,
  ArrowRight, Zap, Shield, Users, Award
} from 'lucide-react';

const features = [
  {
    icon: Brain,
    title: 'AI Tutor',
    description: 'Personalized AI-powered tutoring that adapts to your learning level and explains concepts the way you understand them best.',
    color: 'text-violet-600',
    bg: 'bg-violet-50',
  },
  {
    icon: BookOpen,
    title: 'Smart Practice',
    description: 'Practice questions aligned with actual exam patterns across all subjects and topics with instant AI-powered explanations.',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    icon: BarChart2,
    title: 'Performance Analytics',
    description: 'Deep insights into your preparation — identify weak topics, track accuracy trends, and monitor study progress.',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  {
    icon: Target,
    title: 'Adaptive Learning',
    description: 'The system learns from your performance and automatically prioritizes topics that need more attention.',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  {
    icon: Zap,
    title: 'Mock Tests',
    description: 'Simulate the real exam experience with timed mock tests, question navigation, and detailed score analysis.',
    color: 'text-rose-600',
    bg: 'bg-rose-50',
  },
  {
    icon: Award,
    title: 'Study Plans',
    description: 'Get a personalized day-by-day study plan generated based on your target exam date, score, and daily availability.',
    color: 'text-cyan-600',
    bg: 'bg-cyan-50',
  },
];

const exams = ['SSC CGL', 'SSC CHSL', 'Banking PO', 'TNPSC', 'UPSC', 'Railway', 'GATE', 'CAT', 'JEE', 'NEET'];

const stats = [
  { value: '50,000+', label: 'Practice Questions' },
  { value: '25+', label: 'Competitive Exams' },
  { value: '10+', label: 'Subject Areas' },
  { value: '95%', label: 'Student Satisfaction' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-surface-50 text-surface-900">
      {/* ─── Navigation ──────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-surface-200 bg-white/95 backdrop-blur-md shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
              <Brain size={18} className="text-white" />
            </div>
            <span className="font-bold text-surface-900 text-lg">AI Tutor</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="btn btn-ghost btn-sm">Sign In</Link>
            <Link to="/register" className="btn btn-primary btn-sm">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative pt-20 pb-24 px-4 sm:px-6 overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary-500/8 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-50 border border-primary-200 text-primary-700 text-sm font-medium mb-8">
            <Zap size={14} />
            <span>AI-Powered Exam Preparation Platform</span>
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold text-surface-900 mb-6 leading-tight tracking-tight">
            Crack Your Dream Exam with{' '}
            <span className="gradient-text">AI-Powered</span>{' '}
            Tutoring
          </h1>

          <p className="text-lg sm:text-xl text-surface-500 mb-10 max-w-2xl mx-auto leading-relaxed">
            A complete competitive exam preparation system that learns from you, adapts to your weaknesses, and guides you step-by-step to your target score.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register" className="btn btn-primary btn-lg">
              Start Preparing Free
              <ArrowRight size={18} />
            </Link>
            <Link to="/login" className="btn btn-secondary btn-lg">
              Already have an account
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 mt-12 text-sm text-surface-500">
            {['No credit card required', 'Free to start', '50,000+ practice questions'].map((item) => (
              <div key={item} className="flex items-center gap-1.5">
                <CheckCircle size={14} className="text-emerald-500" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Stats ────────────────────────────────────────────────────────────── */}
      <section className="py-12 border-y border-surface-200 bg-surface-100/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map(({ value, label }) => (
              <div key={label} className="text-center">
                <div className="text-3xl font-bold text-surface-900 mb-1">{value}</div>
                <div className="text-sm text-surface-500">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ─────────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-surface-900 mb-4">
              Everything You Need to Succeed
            </h2>
            <p className="text-surface-500 max-w-xl mx-auto">
              A complete learning ecosystem designed around the proven method: Learn → Practice → Evaluate → Improve.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map(({ icon: Icon, title, description, color, bg }) => (
              <div key={title} className="card hover:shadow-md transition-all">
                <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center mb-4`}>
                  <Icon size={20} className={color} />
                </div>
                <h3 className="text-surface-900 font-semibold text-lg mb-2">{title}</h3>
                <p className="text-surface-500 text-sm leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Supported Exams ──────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 bg-surface-100/50">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-surface-900 mb-4">Supported Competitive Exams</h2>
          <p className="text-surface-500 mb-10">Starting with SSC CGL, expanding to all major competitive examinations.</p>
          <div className="flex flex-wrap justify-center gap-3">
            {exams.map((exam) => (
              <div key={exam} className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors
                ${exam === 'SSC CGL'
                  ? 'bg-primary-50 border-primary-300 text-primary-700'
                  : 'bg-white border-surface-200 text-surface-600 hover:border-surface-300'
                }`}>
                {exam}
                {exam !== 'SSC CGL' && (
                  <span className="ml-2 text-xs text-surface-400">Soon</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="card border-primary-800/50">
            <div className="w-12 h-12 rounded-xl bg-primary-600 flex items-center justify-center mx-auto mb-6">
              <Brain size={24} className="text-white" />
            </div>
            <h2 className="text-3xl font-bold text-surface-900 mb-4">
              Ready to Start Your Preparation?
            </h2>
            <p className="text-surface-500 mb-8">
              Join thousands of students preparing smarter with AI-powered tutoring.
            </p>
            <Link to="/register" className="btn btn-primary btn-lg">
              Create Free Account
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-surface-200 py-8 px-4 text-center text-surface-500 text-sm">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Brain size={16} className="text-primary-600" />
          <span className="font-semibold text-surface-700">AI Tutor</span>
        </div>
        <p>© {new Date().getFullYear()} AI Tutor. Built for competitive exam aspirants.</p>
      </footer>
    </div>
  );
}
