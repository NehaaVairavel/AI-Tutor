import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Brain, ArrowRight, CheckCircle } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = e => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2.5 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center">
              <Brain size={22} className="text-white" />
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-surface-900 mb-1">Reset Password</h1>
          <p className="text-surface-500 text-sm">Enter your email to receive a reset link.</p>
        </div>
        <div className="card">
          {sent ? (
            <div className="text-center py-4">
              <CheckCircle size={40} className="text-emerald-400 mx-auto mb-3" />
              <div className="text-surface-800 font-semibold">Check your email</div>
              <div className="text-surface-500 text-sm mt-1">If an account exists for {email}, you'll receive a reset link shortly.</div>
              <Link to="/login" className="btn btn-primary mt-4 w-full">Back to Login</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" className="form-input" required />
              </div>
              <button type="submit" className="btn btn-primary w-full">
                Send Reset Link <ArrowRight size={15} />
              </button>
              <Link to="/login" className="text-center text-sm text-primary-600 hover:text-primary-700">
                Back to Login
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
