import React, { useEffect, useState } from 'react';
import { X, ExternalLink, Loader2, AlertCircle, FileText, Download, Presentation } from 'lucide-react';
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
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPptx, setIsPptx] = useState(false);

  useEffect(() => {
    if (!profileId || !token) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setPreviewUrl(null);
    setBlobUrl(null);

    const isPresentation = fileName.toLowerCase().endsWith('.pptx');
    setIsPptx(isPresentation);

    const endpoint =
      role === 'IT_VENDOR'
        ? `/api/vendor/profiles/${profileId}/preview`
        : `/api/hiring-manager/profiles/${profileId}/preview`;

    fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to retrieve preview metadata from backend');
        }
        return res.json();
      })
      .then(async (data) => {
        if (!isMounted) return;

        // If backend returned a non-API external URL (e.g. mock test url)
        if (data.previewUrl && data.previewUrl.startsWith('http') && !data.previewUrl.includes('/api/')) {
          setPreviewUrl(data.previewUrl);
          setLoading(false);
          return;
        }

        // Fetch document stream securely via backend
        const streamUrl = data.previewUrl.startsWith('http')
          ? data.previewUrl
          : `${data.previewUrl}${data.previewUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;

        const fileRes = await fetch(streamUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!fileRes.ok) {
          throw new Error(`Failed to stream document (${fileRes.status})`);
        }

        const blob = typeof fileRes.blob === 'function' ? await fileRes.blob() : new Blob();
        const mimeType = isPresentation
          ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          : 'application/pdf';

        const typedBlob = new Blob([blob], { type: mimeType });
        const objectUrl = URL.createObjectURL(typedBlob);

        if (isMounted) {
          setBlobUrl(objectUrl);
          setPreviewUrl(objectUrl);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Error loading document preview');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [profileId, role, token, fileName]);

  // Clean up object URL on unmount or URL change
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

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
              {isPptx ? <Presentation className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
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

            {blobUrl && (
              <a
                href={blobUrl}
                download={fileName}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
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
              <p className="text-sm">Fetching secure document stream...</p>
            </div>
          )}

          {error && (
            <div className="text-center p-6 max-w-md bg-white dark:bg-gray-800 rounded-xl shadow border border-red-200 dark:border-red-900/50">
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
              <h4 className="font-semibold text-gray-900 dark:text-white">Unable to Preview File</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{error}</p>
            </div>
          )}

          {!loading && !error && previewUrl && isPptx && (
            <div className="text-center p-8 max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow border border-gray-200 dark:border-gray-700">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Presentation className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                PowerPoint Presentation Document
              </h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {fileName} is ready for download or external review.
              </p>
              <a
                href={blobUrl || previewUrl}
                download={fileName}
                className="inline-flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium shadow-md shadow-blue-500/20 transition"
              >
                <Download className="w-4 h-4" />
                <span>Download Presentation</span>
              </a>
            </div>
          )}

          {!loading && !error && previewUrl && !isPptx && (
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
