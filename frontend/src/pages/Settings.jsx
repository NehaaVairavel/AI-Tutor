import { useState } from 'react';
import { Shield, Save, Loader2, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services';

export default function Settings() {
  const { user } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleChange = e => {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));
    setError(''); setSuccess('');
  };

  const handleChangePassword = async e => {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) { setError('Passwords do not match.'); return; }
    if (form.newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      await authService.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      setSuccess('Password changed successfully!');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to change password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Settings</h1>
        <p className="text-surface-500 text-sm mt-1">Manage your account security settings.</p>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={16} className="text-primary-400" />
          <h2 className="text-surface-800 font-semibold">Change Password</h2>
        </div>

        {error && <div className="alert alert-error mb-4"><span>{error}</span></div>}
        {success && <div className="alert alert-success mb-4"><CheckCircle size={14} /><span>{success}</span></div>}

        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          {['currentPassword', 'newPassword', 'confirmPassword'].map(f => (
            <div key={f} className="form-group">
              <label className="form-label">
                {f === 'currentPassword' ? 'Current Password' : f === 'newPassword' ? 'New Password' : 'Confirm New Password'}
              </label>
              <input type="password" name={f} value={form[f]} onChange={handleChange} className="form-input" required />
            </div>
          ))}
          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
