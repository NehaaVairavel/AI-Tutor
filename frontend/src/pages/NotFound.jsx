import { Link } from 'react-router-dom';
import { Brain, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center px-4">
      <div className="text-center">
        <div className="text-8xl font-bold text-surface-800 mb-4">404</div>
        <h1 className="text-2xl font-bold text-surface-900 mb-2">Page Not Found</h1>
        <p className="text-surface-500 mb-8">The page you're looking for doesn't exist.</p>
        <Link to="/" className="btn btn-primary">
          <Home size={16} />
          Go Home
        </Link>
      </div>
    </div>
  );
}
