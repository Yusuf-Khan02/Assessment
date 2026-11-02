import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Navbar } from '../components/Navbar';
import {
  ChevronRight,
  Briefcase,
  MapPin,
  Calendar,
  AlertCircle,
  Users,
  CheckCircle2,
  XCircle,
  Sparkles,
} from 'lucide-react';

interface OpeningStats {
  submitted: number;
  shortlisted: number;
  rejected: number;
  recommendedCount: number;
}

interface ManagerOpening {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  contractType: string | null;
  experienceMin: number;
  experienceMax: number | null;
  postedDate: string;
  status: string;
  totalProfiles: number;
  stats: OpeningStats;
}

export const HiringManagerOpeningsPage: React.FC = () => {
  const [openings, setOpenings] = useState<ManagerOpening[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { token } = useAuth();
  const navigate = useNavigate();

  const fetchOpenings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hiring-manager/openings', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch manager openings');
      }

      const data = await res.json();
      setOpenings(data.openings || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading openings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchOpenings();
    }
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your Openings & Candidates</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Review candidate profiles with AI-assisted decision scoring, shortlist, and reject.
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-between text-red-700 dark:text-red-300">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
            <button onClick={fetchOpenings} className="text-sm underline font-medium">
              Retry
            </button>
          </div>
        )}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 animate-pulse space-y-4"
              >
                <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                <div className="h-4 bg-gray-100 dark:bg-gray-700/50 rounded w-1/2"></div>
                <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-between">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                </div>
              </div>
            ))
          ) : openings.length === 0 ? (
            <div className="col-span-full py-16 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              No openings assigned to your account.
            </div>
          ) : (
            openings.map((opening) => (
              <div
                key={opening.id}
                onClick={() => navigate(`/hiring-manager/openings/${opening.id}`)}
                className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm hover:shadow-md border border-gray-200 dark:border-gray-700 cursor-pointer transition flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 uppercase">
                      {opening.status}
                    </span>
                    <span className="text-xs text-gray-400 flex items-center space-x-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{new Date(opening.postedDate).toLocaleDateString()}</span>
                    </span>
                  </div>

                  <h2 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                    {opening.title}
                  </h2>

                  <div className="flex items-center space-x-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center space-x-1">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{opening.location || 'Remote'}</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Briefcase className="w-3.5 h-3.5" />
                      <span>
                        {opening.experienceMin}
                        {opening.experienceMax ? `-${opening.experienceMax}` : '+'} yrs
                      </span>
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <div className="grid grid-cols-4 gap-2 text-center text-xs mb-3">
                    <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <Users className="w-3.5 h-3.5 mx-auto text-gray-400 mb-0.5" />
                      <div className="font-bold text-gray-900 dark:text-white">
                        {opening.totalProfiles}
                      </div>
                      <div className="text-[10px] text-gray-400">Total</div>
                    </div>

                    <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
                      <Sparkles className="w-3.5 h-3.5 mx-auto text-emerald-500 mb-0.5" />
                      <div className="font-bold text-emerald-700 dark:text-emerald-300">
                        {opening.stats.recommendedCount}
                      </div>
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400">AI Match</div>
                    </div>

                    <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto text-blue-500 mb-0.5" />
                      <div className="font-bold text-blue-700 dark:text-blue-300">
                        {opening.stats.shortlisted}
                      </div>
                      <div className="text-[10px] text-blue-600 dark:text-blue-400">Shortlisted</div>
                    </div>

                    <div className="p-2 bg-rose-50 dark:bg-rose-950/30 rounded-lg">
                      <XCircle className="w-3.5 h-3.5 mx-auto text-rose-500 mb-0.5" />
                      <div className="font-bold text-rose-700 dark:text-rose-300">
                        {opening.stats.rejected}
                      </div>
                      <div className="text-[10px] text-rose-600 dark:text-rose-400">Rejected</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs font-medium text-blue-600 dark:text-blue-400">
                    <span>Review Candidates</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
};
