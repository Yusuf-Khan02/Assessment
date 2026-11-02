import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { VendorOpeningsPage } from '../pages/VendorOpeningsPage';
import { VendorOpeningDetailPage } from '../pages/VendorOpeningDetailPage';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';

const mockUser = {
  userId: 'v-123',
  tenantId: 't-123',
  role: 'IT_VENDOR' as const,
  email: 'vendor@test.com',
  name: 'Test Vendor',
};

function renderWithProviders(ui: React.ReactElement, initialPath = '/') {
  localStorage.setItem('token', 'fake-jwt-token');
  localStorage.setItem('user', JSON.stringify(mockUser));

  return render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

describe('Phase 4 — IT Vendor Frontend Component Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('VendorOpeningsPage', () => {
    it('renders openings table with columns and data from API', async () => {
      const mockOpeningsResponse = {
        openings: [
          {
            id: 'op-1',
            title: 'Senior React Engineer',
            description: 'Looking for a React pro',
            location: 'Remote',
            contractType: 'C2C',
            hiringManagerName: 'Lucius Fox',
            experienceMin: 5,
            experienceMax: 8,
            postedDate: new Date().toISOString(),
            status: 'OPEN',
            totalProfilesCount: 3,
          },
        ],
        pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockOpeningsResponse,
      });

      renderWithProviders(<VendorOpeningsPage />);

      expect(screen.getByText(/Contract Openings/i)).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Senior React Engineer')).toBeInTheDocument();
        expect(screen.getByText('Lucius Fox')).toBeInTheDocument();
        expect(screen.getByText('Remote')).toBeInTheDocument();
        expect(screen.getByText('C2C')).toBeInTheDocument();
      });
    });

    it('handles empty state gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          openings: [],
          pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
        }),
      });

      renderWithProviders(<VendorOpeningsPage />);

      await waitFor(() => {
        expect(screen.getByText(/No openings available at this time/i)).toBeInTheDocument();
      });
    });

    it('handles API error state and allows retry', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Database network timeout' }),
      });

      renderWithProviders(<VendorOpeningsPage />);

      await waitFor(() => {
        expect(screen.getByText(/Database network timeout/i)).toBeInTheDocument();
        expect(screen.getByText(/Retry/i)).toBeInTheDocument();
      });
    });
  });

  describe('VendorOpeningDetailPage & Upload Flow', () => {
    const mockDetail = {
      id: 'op-1',
      title: 'Senior React Engineer',
      description: 'Role details here',
      location: 'Remote',
      contractType: 'C2C',
      hiringManagerName: 'Lucius Fox',
      experienceRange: { min: 5, max: 8 },
      postedDate: new Date().toISOString(),
      status: 'OPEN',
      ownProfilesCount: 1,
      uploadedProfiles: [
        {
          id: 501,
          openingId: 'op-1',
          s3Key: 'tenant/op-1/12345_resume.pdf',
          submittedAt: new Date().toISOString(),
          status: 'SUBMITTED',
        },
      ],
    };

    it('renders opening details and existing submitted profiles', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDetail,
      });

      renderWithProviders(
        <Routes>
          <Route path="/vendor/openings/:id" element={<VendorOpeningDetailPage />} />
        </Routes>,
        '/vendor/openings/op-1'
      );

      await waitFor(() => {
        expect(screen.getByText('Senior React Engineer')).toBeInTheDocument();
        expect(screen.getByText('Lucius Fox')).toBeInTheDocument();
        expect(screen.getByText(/12345_resume\.pdf/)).toBeInTheDocument();
      });
    });

    it('client-side validates file format and rejects non-PDF/PPTX files', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDetail,
      });

      const { container } = renderWithProviders(
        <Routes>
          <Route path="/vendor/openings/:id" element={<VendorOpeningDetailPage />} />
        </Routes>,
        '/vendor/openings/op-1'
      );

      await waitFor(() => {
        expect(screen.getByText('Senior React Engineer')).toBeInTheDocument();
      });

      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeInTheDocument();

      const invalidFile = new File(['dummy content'], 'document.txt', { type: 'text/plain' });
      fireEvent.change(fileInput, { target: { files: [invalidFile] } });

      await waitFor(() => {
        expect(
          screen.getByText(/Invalid file format "\.txt"\. Only PDF and PPTX files are supported/i)
        ).toBeInTheDocument();
      });
    });

    it('accepts valid PDF file and prepares it for submission', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDetail,
      });

      const { container } = renderWithProviders(
        <Routes>
          <Route path="/vendor/openings/:id" element={<VendorOpeningDetailPage />} />
        </Routes>,
        '/vendor/openings/op-1'
      );

      await waitFor(() => {
        expect(screen.getByText('Senior React Engineer')).toBeInTheDocument();
      });

      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
      const validFile = new File(['valid pdf binary'], 'candidate.pdf', {
        type: 'application/pdf',
      });
      fireEvent.change(fileInput, { target: { files: [validFile] } });

      await waitFor(() => {
        expect(screen.getByText('candidate.pdf')).toBeInTheDocument();
        expect(screen.getByText('Ready')).toBeInTheDocument();
        expect(screen.getByText(/Submit Profiles/i)).toBeInTheDocument();
      });
    });
  });
});
