import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Navbar } from '../components/Navbar';
import { SkeletonCard, SkeletonDetail } from '../components/SkeletonLoader';
import { ResumePreviewModal } from '../components/ResumePreviewModal';
import { FixedSizeList as List } from 'react-window';
import {
  ArrowLeft,
  FileText,
  Clock,
  Sparkles,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Calendar,
  MapPin,
  Briefcase,
  User,
  Eye,
  BarChart2,
} from 'lucide-react';

export interface ReasoningMetadataUI {
  skillMatchScore?: number;
  experienceMatchScore?: number;
  locationMatchScore?: number;
  finalScore?: number;
  matchingSkills?: string[];
  missingSkills?: string[];
  detectedExperience?: number;
  detectedLocation?: string;
}

export interface ManagerProfileItem {
  id: number;
  openingId: string;
  s3Key: string;
  fileName: string;
  uploadedBy: string;
  uploaderName: string;
  submittedAt: string;
  status: 'SUBMITTED' | 'SHORTLISTED' | 'REJECTED';
  shortlistedBy: string | null;
  shortlistedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  recommended: boolean | null;
  recommendationScore: number | null;
  recommendationScorePercent: number | null;
  recommendationReason: string | null;
  recommendationConfidence: number | null;
  recommendationConfidencePercent: number | null;
  recommendationLatencyMs: number | null;
  recommendationVersion: string | null;
  recommendedAt: string | null;
  reasoningMetadata?: ReasoningMetadataUI | null;
  badge: 'Recommended' | 'Borderline' | 'Not Recommended' | string;
  badgeBand: 'RECOMMENDED' | 'BORDERLINE' | 'NOT_RECOMMENDED';
}

interface OpeningSummary {
  id: string;
  title: string;
  experienceMin: number;
  experienceMax: number | null;
  location: string | null;
}

export const HiringManagerOpeningDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [opening, setOpening] = useState<OpeningSummary | null>(null);
  const [profiles, setProfiles] = useState<ManagerProfileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [previewProfile, setPreviewProfile] = useState<{ id: number; fileName: string } | null>(null);

  const fetchProfiles = async () => {
    if (!id || !token) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/hiring-manager/openings/${id}/profiles`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to load profiles');
      }

      const data = await res.json();
      setOpening(data.opening);
      setProfiles(data.profiles || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error fetching profiles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, [id, token]);

  // Optimistic Shortlist with Rollback
  const handleShortlist = async (profileId: number) => {
    setActionLoadingId(profileId);
    const prevProfiles = [...profiles];

    // Optimistic update
    setProfiles((prev) =>
      prev.map((p) => (p.id === profileId ? { ...p, status: 'SHORTLISTED' as const } : p))
    );

    try {
      const res = await fetch(`/api/hiring-manager/profiles/${profileId}/shortlist`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to shortlist profile');
      }
    } catch (err: unknown) {
      // Rollback
      setProfiles(prevProfiles);
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Optimistic Reject with Rollback
  const handleReject = async (profileId: number) => {
    setActionLoadingId(profileId);
    const prevProfiles = [...profiles];

    // Optimistic update
    setProfiles((prev) =>
      prev.map((p) => (p.id === profileId ? { ...p, status: 'REJECTED' as const } : p))
    );

    try {
      const res = await fetch(`/api/hiring-manager/profiles/${profileId}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to reject profile');
      }
    } catch (err: unknown) {
      // Rollback
      setProfiles(prevProfiles);
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  const getBadgeStyle = (band: string) => {
    switch (band) {
      case 'RECOMMENDED':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'BORDERLINE':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      default:
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border-rose-200 dark:border-rose-800';
    }
  };

  const renderProfileCard = (profile: ManagerProfileItem) => {
    const isActionPending = actionLoadingId === profile.id;

    return (
      <div
        key={profile.id}
        data-testid={`profile-card-${profile.id}`}
        className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4 hover:border-gray-300 dark:hover:border-gray-600 transition"
      >
        {/* Top Header: File, Status, Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-gray-900 dark:text-white text-base">
                {profile.fileName}
              </div>
              <div className="flex items-center space-x-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                <span className="flex items-center space-x-1">
                  <User className="w-3.5 h-3.5" />
                  <span>Vendor: {profile.uploaderName}</span>
                </span>
                <span className="flex items-center space-x-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{new Date(profile.submittedAt).toLocaleDateString()}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Status indicator */}
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                profile.status === 'SHORTLISTED'
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                  : profile.status === 'REJECTED'
                  ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                  : 'bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
              }`}
            >
              {profile.status}
            </span>

            {/* AI Recommendation Badge */}
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center space-x-1 ${getBadgeStyle(
                profile.badgeBand
              )}`}
            >
              <Sparkles className="w-3 h-3" />
              <span>{profile.badge}</span>
            </span>
          </div>
        </div>

        {/* AI Metrics Row */}
        <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 dark:bg-gray-750/50 dark:bg-gray-700/30 rounded-lg text-center text-xs">
          <div>
            <div className="text-gray-500 dark:text-gray-400">Match Score</div>
            <div className="font-bold text-base text-gray-900 dark:text-white mt-0.5">
              {profile.recommendationScorePercent !== null
                ? `${profile.recommendationScorePercent}%`
                : 'Pending'}
            </div>
          </div>

          <div>
            <div className="text-gray-500 dark:text-gray-400">AI Confidence</div>
            <div className="font-bold text-base text-gray-900 dark:text-white mt-0.5">
              {profile.recommendationConfidencePercent !== null
                ? `${profile.recommendationConfidencePercent}%`
                : 'Pending'}
            </div>
          </div>

          <div>
            <div className="text-gray-500 dark:text-gray-400">Agent Processing</div>
            <div className="font-bold text-base text-gray-900 dark:text-white mt-0.5 flex items-center justify-center space-x-1">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              <span>{profile.recommendationLatencyMs ? `${profile.recommendationLatencyMs}ms` : '—'}</span>
            </div>
          </div>
        </div>

        {/* AI Explanation / Reasoning */}
        {profile.recommendationReason && (
          <div className="text-sm bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 rounded-lg p-3">
            <div className="font-semibold text-xs text-blue-900 dark:text-blue-300 uppercase tracking-wide mb-1">
              AI Decision Explanation
            </div>
            <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
              {profile.recommendationReason}
            </p>
          </div>
        )}

        {/* Intermediate Reasoning Breakdown (Formula Sub-Components) */}
        {profile.reasoningMetadata && (
          <div className="p-3 bg-gray-50/80 dark:bg-gray-700/20 rounded-lg border border-gray-100 dark:border-gray-700/50 space-y-2">
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
              <BarChart2 className="w-3.5 h-3.5 text-blue-500" />
              <span>Deterministic Formula Breakdown (0.5*Skill + 0.3*Exp + 0.2*Loc)</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-white dark:bg-gray-800 p-2 rounded border border-gray-100 dark:border-gray-700">
                <span className="text-gray-500 dark:text-gray-400 block text-[10px]">Skill Overlap (50%)</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {Math.round((profile.reasoningMetadata.skillMatchScore || 0) * 100)}%
                </span>
              </div>
              <div className="bg-white dark:bg-gray-800 p-2 rounded border border-gray-100 dark:border-gray-700">
                <span className="text-gray-500 dark:text-gray-400 block text-[10px]">Experience (30%)</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {Math.round((profile.reasoningMetadata.experienceMatchScore || 0) * 100)}%
                </span>
              </div>
              <div className="bg-white dark:bg-gray-800 p-2 rounded border border-gray-100 dark:border-gray-700">
                <span className="text-gray-500 dark:text-gray-400 block text-[10px]">Location (20%)</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {Math.round((profile.reasoningMetadata.locationMatchScore || 0) * 100)}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons: Preview, Shortlist & Reject */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setPreviewProfile({ id: profile.id, fileName: profile.fileName })}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-blue-600 hover:text-blue-700 dark:text-blue-400 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 transition"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Preview Resume</span>
          </button>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              disabled={isActionPending || profile.status === 'REJECTED'}
              onClick={() => handleReject(profile.id)}
              className="flex items-center space-x-1.5 px-4 py-2 text-sm font-medium rounded-lg text-rose-700 dark:text-rose-300 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/70 border border-rose-200 dark:border-rose-900/60 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {isActionPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              <span>Reject</span>
            </button>

            <button
              type="button"
              disabled={isActionPending || profile.status === 'SHORTLISTED'}
              onClick={() => handleShortlist(profile.id)}
              className="flex items-center space-x-1.5 px-4 py-2 text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition"
            >
              {isActionPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              <span>Shortlist</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Virtualized row renderer for >50 items
  const VirtualRow: React.FC<{ index: number; style: React.CSSProperties }> = ({
    index,
    style,
  }) => {
    const profile = profiles[index];
    return (
      <div style={{ ...style, paddingBottom: 16 }}>
        {renderProfileCard(profile)}
      </div>
    );
  };

  const useVirtualization = useMemo(() => profiles.length > 50, [profiles.length]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
          <SkeletonDetail />
          <SkeletonCard count={3} />
        </main>
      </div>
    );
  }

  if (error || !opening) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
        <Navbar />
        <div className="max-w-4xl mx-auto py-12 px-4 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Opening Unavailable
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <button
            onClick={() => navigate('/hiring-manager/openings')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Back to Openings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <button
            onClick={() => navigate('/hiring-manager/openings')}
            className="inline-flex items-center space-x-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Openings</span>
          </button>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {opening.title}
            </h1>
            <div className="flex items-center space-x-6 mt-3 text-sm text-gray-500 dark:text-gray-400">
              <span className="flex items-center space-x-1.5">
                <Briefcase className="w-4 h-4 text-gray-400" />
                <span>
                  Experience: {opening.experienceMin}
                  {opening.experienceMax ? `-${opening.experienceMax}` : '+'} yrs
                </span>
              </span>
              <span className="flex items-center space-x-1.5">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span>Location: {opening.location || 'Remote'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Profiles Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Candidate Profiles ({profiles.length})
            </h2>
            {useVirtualization && (
              <span className="text-xs px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 font-medium">
                Virtualized List Active (&gt;50 records)
              </span>
            )}
          </div>

          {profiles.length === 0 ? (
            <div className="py-16 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              No candidate profiles have been submitted for this opening yet.
            </div>
          ) : useVirtualization ? (
            <div data-testid="virtualized-list-container">
              <List
                height={750}
                itemCount={profiles.length}
                itemSize={310}
                width="100%"
              >
                {VirtualRow}
              </List>
            </div>
          ) : (
            <div className="space-y-4">
              {profiles.map((p) => renderProfileCard(p))}
            </div>
          )}
        </div>
      </main>

      {previewProfile && (
        <ResumePreviewModal
          profileId={previewProfile.id}
          fileName={previewProfile.fileName}
          role="HIRING_MANAGER"
          onClose={() => setPreviewProfile(null)}
        />
      )}
    </div>
  );
};
