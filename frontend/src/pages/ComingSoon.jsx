import { Brain, Construction } from 'lucide-react';

export default function ComingSoon({ title = 'Coming Soon', description = 'This feature is being built.' }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-surface-50">{title}</h1>
      <div className="card">
        <div className="empty-state">
          <Construction size={40} className="text-primary-500 opacity-60" />
          <div>
            <div className="text-surface-700 font-semibold text-lg">{title}</div>
            <div className="text-surface-500 text-sm mt-1">{description}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
