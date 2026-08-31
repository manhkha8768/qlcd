import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="text-center">
        <h1 className="mb-4 text-6xl font-bold text-gray-900">404</h1>
        <p className="mb-6 text-xl text-gray-600">Page not found</p>
        <Link to="/health" className="text-blue-600 hover:text-blue-800">
          Check API Health
        </Link>
      </div>
    </div>
  );
}
