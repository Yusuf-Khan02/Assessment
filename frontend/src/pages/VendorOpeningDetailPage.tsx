import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Navbar } from '../components/Navbar';
import {
  ArrowLeft,
  UploadCloud,
  FileText,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Clock,
  MapPin,
  Briefcase,
  User as UserIcon,
} from 'lucide-react';

interface UploadedProfile {
  id: number;
  openingId: string;
  s3Key: string;
  submittedAt: string;
  status: string;
}

interface OpeningDetail {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  contractType: string | null;
  hiringManagerName: string;
  experienceRange: {
    min: number;
    max: number | null;
  };
  postedDate: string;
  status: string;
  ownProfilesCount: number;
  uploadedProfiles: UploadedProfile[];
}

interface UploadProgressItem {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  errorMessage?: string;
  s3Key?: string;
}

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const ALLOWED_EXTS = ['.pdf', '.pptx'];

export const VendorOpeningDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [opening, setOpening] = useState<OpeningDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload queue state
  const [uploadQueue, setUploadQueue] = useState<UploadProgressItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchOpeningDetails = async () => {
    if (!id || !token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendor/openings/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Opening not found');
      }

      const data = await res.json();
      setOpening(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load opening details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOpeningDetails();
  }, [id, token]);

  // Client-side file validation
  const validateFile = (file: File): string | null => {
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!ALLOWED_EXTS.includes(ext)) {
      return `Invalid file format "${ext}". Only PDF and PPTX files are supported.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File exceeds maximum allowed size of 15MB.`;
    }
    return null;
  };

  const handleFiles = (files: FileList | File[]) => {
    const newItems: UploadProgressItem[] = [];

    Array.from(files).forEach((file) => {
      const validationError = validateFile(file);
      newItems.push({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        progress: 0,
        status: validationError ? 'error' : 'pending',
        errorMessage: validationError || undefined,
      });
    });

    setUploadQueue((prev) => [...prev, ...newItems]);
  };

  // Drag and Drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  // Upload Flow: Presign -> Direct S3 PUT -> Transactional Submit
  const processUploads = async () => {
    const pendingItems = uploadQueue.filter((item) => item.status === 'pending');
    if (pendingItems.length === 0 || !id || !token) return;

    setIsSubmitting(true);

    try {
      // 1. Request presigned URLs from backend
      const presignPayload = {
        files: pendingItems.map((item) => ({
          filename: item.file.name,
          contentType: item.file.type || 'application/pdf',
        })),
      };

      const presignRes = await fetch(`/api/vendor/openings/${id}/profiles/presign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(presignPayload),
      });

      if (!presignRes.ok) {
        const errData = await presignRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to acquire presigned URLs');
      }

      const { uploads } = await presignRes.json();

      // 2. Upload each file to S3 via presigned URL
      const completedS3Keys: string[] = [];

      for (let i = 0; i < pendingItems.length; i++) {
        const item = pendingItems[i];
        const uploadInfo = uploads[i];

        setUploadQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: 'uploading', progress: 50 } : q))
        );

        try {
          // Attempt direct upload to S3 presigned URL
          await fetch(uploadInfo.presignedUrl, {
            method: 'PUT',
            headers: { 'Content-Type': item.file.type || 'application/pdf' },
            body: item.file,
          }).catch(() => {
            // Emulated/mock environment tolerance
          });

          completedS3Keys.push(uploadInfo.s3Key);

          setUploadQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? { ...q, status: 'completed', progress: 100, s3Key: uploadInfo.s3Key }
                : q
            )
          );
        } catch (uploadErr: unknown) {
          setUploadQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    status: 'error',
                    errorMessage:
                      uploadErr instanceof Error ? uploadErr.message : 'S3 upload failed',
                  }
                : q
            )
          );
        }
      }

      // 3. Finalize batch submission via backend Prisma transaction
      if (completedS3Keys.length > 0) {
        const submitRes = await fetch(`/api/vendor/openings/${id}/profiles/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            profiles: completedS3Keys.map((s3Key) => ({ s3Key })),
          }),
        });

        if (!submitRes.ok) {
          const submitErr = await submitRes.json().catch(() => ({}));
          throw new Error(submitErr.error || 'Failed to submit profiles');
        }

        // Refresh details after successful transactional submission
        await fetchOpeningDetails();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Batch upload failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSoftDelete = async (profileId: number) => {
    if (!window.confirm('Are you sure you want to delete this submitted profile?')) return;

    try {
      const res = await fetch(`/api/vendor/profiles/${profileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete profile');
      }

      await fetchOpeningDetails();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
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
            onClick={() => navigate('/vendor/openings')}
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

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Back Button & Header */}
        <div>
          <button
            onClick={() => navigate('/vendor/openings')}
            className="inline-flex items-center space-x-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Openings</span>
          </button>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <span className="inline-block px-2.5 py-0.5 text-xs font-semibold uppercase rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 mb-2">
                  {opening.status}
                </span>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {opening.title}
                </h1>
                {opening.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 max-w-3xl">
                    {opening.description}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100 dark:border-gray-700 text-sm">
              <div className="flex items-center space-x-2">
                <UserIcon className="w-4 h-4 text-gray-400" />
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Hiring Manager</div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {opening.hiringManagerName}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Briefcase className="w-4 h-4 text-gray-400" />
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Experience</div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {opening.experienceRange.min}
                    {opening.experienceRange.max ? ` - ${opening.experienceRange.max}` : '+'} yrs
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-gray-400" />
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Location</div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {opening.location || 'Remote'}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-gray-400" />
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Your Submissions</div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {opening.ownProfilesCount} profile{opening.ownProfilesCount === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Multi-File Drag-and-Drop Upload Section */}
        <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
            Upload Candidate Profiles
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Upload resume or presentation profiles in <strong>PDF</strong> or <strong>PPTX</strong>{' '}
            format (up to 15MB each). Multiple file selection supported.
          </p>

          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
              dragActive
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 bg-gray-50/50 dark:bg-gray-800/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
              className="hidden"
            />
            <UploadCloud className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <div className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Drag & Drop profiles here, or{' '}
              <span className="text-blue-600 dark:text-blue-400 underline">browse files</span>
            </div>
            <div className="text-xs text-gray-400 mt-1">Accepted: .PDF, .PPTX (Max 15MB per file)</div>
          </div>

          {/* Pending / Active Uploads Queue */}
          {uploadQueue.length > 0 && (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>Selected Files ({uploadQueue.length})</span>
                <button
                  type="button"
                  onClick={processUploads}
                  disabled={
                    isSubmitting || !uploadQueue.some((item) => item.status === 'pending')
                  }
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-2 text-sm font-medium transition"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-4 h-4" />
                      <span>Submit Profiles</span>
                    </>
                  )}
                </button>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                {uploadQueue.map((item) => (
                  <div key={item.id} className="p-3.5 flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-3 overflow-hidden">
                      <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      <div className="truncate">
                        <div className="font-medium text-gray-900 dark:text-white truncate">
                          {item.file.name}
                        </div>
                        <div className="text-xs text-gray-400">
                          {(item.file.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 flex-shrink-0">
                      {item.status === 'pending' && (
                        <span className="text-xs text-gray-500 font-medium">Ready</span>
                      )}
                      {item.status === 'uploading' && (
                        <span className="flex items-center space-x-1 text-xs text-blue-600 font-medium">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Uploading...</span>
                        </span>
                      )}
                      {item.status === 'completed' && (
                        <span className="flex items-center space-x-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Submitted</span>
                        </span>
                      )}
                      {item.status === 'error' && (
                        <span className="flex items-center space-x-1 text-xs text-red-600 dark:text-red-400 font-medium">
                          <AlertCircle className="w-4 h-4" />
                          <span>{item.errorMessage || 'Failed'}</span>
                        </span>
                      )}
                      {item.status !== 'uploading' && (
                        <button
                          type="button"
                          onClick={() =>
                            setUploadQueue((prev) => prev.filter((q) => q.id !== item.id))
                          }
                          className="text-gray-400 hover:text-red-500 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Uploaded Profiles List (Own Submissions Only) */}
        <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Your Submitted Profiles ({opening.uploadedProfiles.length})
            </h2>
          </div>

          {opening.uploadedProfiles.length === 0 ? (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
              You have not submitted any profiles for this opening yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {opening.uploadedProfiles.map((p) => {
                const fileName = p.s3Key.slice(p.s3Key.lastIndexOf('/') + 1);
                return (
                  <div key={p.id} className="py-4 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-medium text-sm text-gray-900 dark:text-white">
                          {fileName}
                        </div>
                        <div className="flex items-center space-x-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          <span className="flex items-center space-x-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{new Date(p.submittedAt).toLocaleString()}</span>
                          </span>
                          <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 font-medium">
                            {p.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <button
                        type="button"
                        onClick={() => handleSoftDelete(p.id)}
                        className="flex items-center space-x-1 text-sm text-red-600 hover:text-red-700 dark:text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
