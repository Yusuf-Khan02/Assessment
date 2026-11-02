import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HiringManagerOpeningDetailPage } from '../pages/HiringManagerOpeningDetailPage';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';

const mockManager = {
  userId: 'm-123',
  tenantId: 't-123',
  role: 'HIRING_MANAGER' as const,
  email: 'manager@test.com',
  name: 'Test Manager',
};

function renderWithProviders(ui: React.ReactElement, initialPath = '/') {
  localStorage.setItem('token', 'fake-jwt-token');
  localStorage.setItem('user', JSON.stringify(mockManager));

  return render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

describe('Phase 7 — Hiring Manager Frontend Component Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const sampleOpening = {
    id: 'op-hm-1',
    title: 'Lead Architect',
    experienceMin: 8,
    experienceMax: 12,
    location: 'Remote',
  };

  const sampleProfiles = [
    {
      id: 1,
      openingId: 'op-hm-1',
      s3Key: 'tenant/op/resume_recommended.pdf',
      fileName: 'resume_recommended.pdf',
      uploadedBy: 'vendor-1',
      uploaderName: 'Tech Partner Alpha',
      submittedAt: new Date().toISOString(),
      status: 'SUBMITTED' as const,
      shortlistedBy: null,
      shortlistedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      recommended: true,
      recommendationScore: 0.88,
      recommendationScorePercent: 88,
      recommendationReason: 'Excellent architecture background and full skill overlap',
      recommendationConfidence: 0.94,
      recommendationConfidencePercent: 94,
      recommendationLatencyMs: 420,
      recommendationVersion: 'v1.0.0-agent',
      recommendedAt: new Date().toISOString(),
      badge: 'Recommended',
      badgeBand: 'RECOMMENDED' as const,
    },
    {
      id: 2,
      openingId: 'op-hm-1',
      s3Key: 'tenant/op/resume_borderline.pdf',
      fileName: 'resume_borderline.pdf',
      uploadedBy: 'vendor-1',
      uploaderName: 'Tech Partner Alpha',
      submittedAt: new Date().toISOString(),
      status: 'SUBMITTED' as const,
      shortlistedBy: null,
      shortlistedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      recommended: false,
      recommendationScore: 0.62,
      recommendationScorePercent: 62,
      recommendationReason: 'Moderate skill overlap, experience near lower threshold',
      recommendationConfidence: 0.82,
      recommendationConfidencePercent: 82,
      recommendationLatencyMs: 380,
      recommendationVersion: 'v1.0.0-agent',
      recommendedAt: new Date().toISOString(),
      badge: 'Borderline',
      badgeBand: 'BORDERLINE' as const,
    },
    {
      id: 3,
      openingId: 'op-hm-1',
      s3Key: 'tenant/op/resume_rejected.pdf',
      fileName: 'resume_rejected.pdf',
      uploadedBy: 'vendor-1',
      uploaderName: 'Tech Partner Alpha',
      submittedAt: new Date().toISOString(),
      status: 'SUBMITTED' as const,
      shortlistedBy: null,
      shortlistedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      recommended: false,
      recommendationScore: 0.35,
      recommendationScorePercent: 35,
      recommendationReason: 'Experience is below required minimum',
      recommendationConfidence: 0.96,
      recommendationConfidencePercent: 96,
      recommendationLatencyMs: 290,
      recommendationVersion: 'v1.0.0-agent',
      recommendedAt: new Date().toISOString(),
      badge: 'Not Recommended',
      badgeBand: 'NOT_RECOMMENDED' as const,
    },
  ];

  it('renders all required profile fields: file name, date, badges, score, confidence, reason, latency, actions', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        opening: sampleOpening,
        profiles: sampleProfiles,
      }),
    });

    renderWithProviders(
      <Routes>
        <Route path="/hiring-manager/openings/:id" element={<HiringManagerOpeningDetailPage />} />
      </Routes>,
      '/hiring-manager/openings/op-hm-1'
    );

    await waitFor(() => {
      // Title
      expect(screen.getByText('Lead Architect')).toBeInTheDocument();

      // Card 1: Recommended
      expect(screen.getByText('resume_recommended.pdf')).toBeInTheDocument();
      expect(screen.getByText('Recommended')).toBeInTheDocument();
      expect(screen.getByText('88%')).toBeInTheDocument();
      expect(screen.getByText('94%')).toBeInTheDocument();
      expect(screen.getByText('420ms')).toBeInTheDocument();
      expect(
        screen.getByText('Excellent architecture background and full skill overlap')
      ).toBeInTheDocument();

      // Card 2: Borderline
      expect(screen.getByText('resume_borderline.pdf')).toBeInTheDocument();
      expect(screen.getByText('Borderline')).toBeInTheDocument();
      expect(screen.getByText('62%')).toBeInTheDocument();

      // Card 3: Not Recommended
      expect(screen.getByText('resume_rejected.pdf')).toBeInTheDocument();
      expect(screen.getByText('Not Recommended')).toBeInTheDocument();
      expect(screen.getByText('35%')).toBeInTheDocument();
    });

    // Buttons
    const shortlistBtns = screen.getAllByRole('button', { name: /shortlist/i });
    const rejectBtns = screen.getAllByRole('button', { name: /reject/i });
    expect(shortlistBtns.length).toBe(3);
    expect(rejectBtns.length).toBe(3);
  });

  it('optimistic UI update on shortlist action', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/shortlist')) {
        return { ok: true, json: async () => ({ message: 'Shortlisted' }) };
      }
      return {
        ok: true,
        json: async () => ({ opening: sampleOpening, profiles: [sampleProfiles[0]] }),
      };
    });

    renderWithProviders(
      <Routes>
        <Route path="/hiring-manager/openings/:id" element={<HiringManagerOpeningDetailPage />} />
      </Routes>,
      '/hiring-manager/openings/op-hm-1'
    );

    await waitFor(() => {
      expect(screen.getByText('resume_recommended.pdf')).toBeInTheDocument();
    });

    const shortlistBtn = screen.getByRole('button', { name: /shortlist/i });
    fireEvent.click(shortlistBtn);

    await waitFor(() => {
      expect(screen.getByText('SHORTLISTED')).toBeInTheDocument();
    });
  });

  it('virtualization kicks in when profile count > 50', async () => {
    const manyProfiles = Array.from({ length: 65 }).map((_, i) => ({
      ...sampleProfiles[0],
      id: i + 1,
      fileName: `candidate_${i + 1}.pdf`,
    }));

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        opening: sampleOpening,
        profiles: manyProfiles,
      }),
    });

    renderWithProviders(
      <Routes>
        <Route path="/hiring-manager/openings/:id" element={<HiringManagerOpeningDetailPage />} />
      </Routes>,
      '/hiring-manager/openings/op-hm-1'
    );

    await waitFor(() => {
      expect(screen.getByText(/Virtualized List Active/i)).toBeInTheDocument();
      expect(screen.getByTestId('virtualized-list-container')).toBeInTheDocument();
    });
  });
});

