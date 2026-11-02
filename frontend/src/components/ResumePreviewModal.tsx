import React, { useEffect, useState } from 'react';
import { X, ExternalLink, Loader2, AlertCircle, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ResumePreviewModalProps {
  profileId: number | null;
  fileName: string;
  role: 'IT_VENDOR' | 'HIRING_MANAGER';
  onClose: () => void;
}

export const ResumePreviewModal: React.FC<ResumePreviewModalProps> = ({
  profileId,
  fileName,
  role,
  onClose,
}) => {
  const { token } = useAuth();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId || !token) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    const endpoint =
      role === 'IT_VENDOR'
        ? `/api/vendor/profiles/${profileId}/preview`
        : `/api/hiring-manager/profiles/${profileId}/preview`;

    fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to retrieve preview URL from backend');
        }
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setPreviewUrl(data.previewUrl);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Error loading preview');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [profileId, role, token]);

  if (!profileId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-850">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate max-w-md">
                {fileName}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Secure backend preview • S3 credentials protected
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in Tab</span>
              </a>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4 relative">
          {loading && (
            <div className="flex flex-col items-center justify-center space-y-3 text-gray-500 dark:text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-sm">Fetching secure presigned document stream...</p>
            </div>
          )}

          {error && (
            <div className="text-center p-6 max-w-md bg-white dark:bg-gray-800 rounded-xl shadow border border-red-200 dark:border-red-900/50">
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
              <h4 className="font-semibold text-gray-900 dark:text-white">Unable to Preview File</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{error}</p>
            </div>
          )}

          {!loading && !error && previewUrl && (
            <iframe
              src={previewUrl}
              title={`Preview of ${fileName}`}
              className="w-full h-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
};
