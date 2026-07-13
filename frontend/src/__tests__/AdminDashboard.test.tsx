import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { AdminDashboard } from '../pages/AdminDashboard.js';
import { ConfirmDialogProvider } from '../components/ui/index.js';
import * as adminApiModule from '../api/admin.js';

vi.mock('../api/admin.js', () => ({
  adminApi: {
    listUsers: vi.fn(),
    createUser: vi.fn(),
    deactivateUser: vi.fn(),
    activateUser: vi.fn(),
    listProjects: vi.fn(),
    createProject: vi.fn(),
    assignPM: vi.fn(),
    archiveProject: vi.fn(),
    unarchiveProject: vi.fn(),
  },
}));

const mockAdminApi = adminApiModule.adminApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

const sampleUsers = [
  { id: 'u1', email: 'pm@test.com', name: 'PM One', role: 'pm', is_active: true },
  { id: 'u2', email: 'admin@test.com', name: 'Admin', role: 'system_admin', is_active: false },
];
const sampleProjects = [
  { id: 'p1', name: 'Alpha', client_name: 'ACME', assigned_pm_id: 'u1', pm_name: 'PM One', pm_email: 'pm@test.com', status: 'active' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockAdminApi['listUsers'].mockResolvedValue(sampleUsers);
  mockAdminApi['listProjects'].mockResolvedValue(sampleProjects);
  mockAdminApi['createUser'].mockResolvedValue({ id: 'new', email: 'new@test.com', name: '', role: 'pm', is_active: true });
  mockAdminApi['createProject'].mockResolvedValue({ id: 'new-p', name: 'Beta', client_name: 'Corp', assigned_pm_id: null, pm_name: null, pm_email: null, status: 'active' });
  mockAdminApi['deactivateUser'].mockResolvedValue({ success: true });
  mockAdminApi['activateUser'].mockResolvedValue({ success: true });
  mockAdminApi['archiveProject'].mockResolvedValue({ success: true });
  mockAdminApi['unarchiveProject'].mockResolvedValue({ success: true });
  mockAdminApi['assignPM'].mockResolvedValue({ success: true });
});

describe('AdminDashboard — Users tab', () => {
  it('renders the Users tab by default and lists users', async () => {
    render(<ConfirmDialogProvider><AdminDashboard /></ConfirmDialogProvider>);
    await waitFor(() => expect(screen.getByText('pm@test.com')).toBeInTheDocument());
    expect(screen.getByText('admin@test.com')).toBeInTheDocument();
  });

  it('shows Add User form when button clicked', async () => {
    render(<ConfirmDialogProvider><AdminDashboard /></ConfirmDialogProvider>);
    await waitFor(() => screen.getByText('+ Add User'));
    fireEvent.click(screen.getByText('+ Add User'));
    expect(screen.getByPlaceholderText('user@company.com')).toBeInTheDocument();
  });

  it('shows validation error when email is missing', async () => {
    render(<ConfirmDialogProvider><AdminDashboard /></ConfirmDialogProvider>);
    await waitFor(() => screen.getByText('+ Add User'));
    fireEvent.click(screen.getByText('+ Add User'));

    fireEvent.click(screen.getByText('Create User'));
    // HTML5 email required validation fires — createUser should not be called
    expect(mockAdminApi['createUser']).not.toHaveBeenCalled();
  });

  it('shows validation error when password is too short or too long', async () => {
    render(<ConfirmDialogProvider><AdminDashboard /></ConfirmDialogProvider>);
    await waitFor(() => screen.getByText('+ Add User'));
    fireEvent.click(screen.getByText('+ Add User'));

    // Too short password
    fireEvent.change(screen.getByPlaceholderText('user@company.com'), { target: { value: 'new@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Min 8 characters'), { target: { value: 'short7' } });
    fireEvent.click(screen.getByText('Create User'));
    expect(screen.getAllByText('Password must be at least 8 characters.').length).toBeGreaterThan(0);
    expect(mockAdminApi['createUser']).not.toHaveBeenCalled();

    // Too long password (> 50 chars)
    fireEvent.change(screen.getByPlaceholderText('Min 8 characters'), { target: { value: 'a'.repeat(51) } });
    fireEvent.click(screen.getByText('Create User'));
    expect(screen.getAllByText('Password must be at most 50 characters.').length).toBeGreaterThan(0);
    expect(mockAdminApi['createUser']).not.toHaveBeenCalled();
  });

  it('calls createUser with correct data and refreshes list', async () => {
    render(<ConfirmDialogProvider><AdminDashboard /></ConfirmDialogProvider>);
    await waitFor(() => screen.getByText('+ Add User'));
    fireEvent.click(screen.getByText('+ Add User'));

    fireEvent.change(screen.getByPlaceholderText('user@company.com'), { target: { value: 'new@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Min 8 characters'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByText('Create User'));

    await waitFor(() => expect(mockAdminApi['createUser']).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@test.com', role: 'pm' })
    ));
  });

  it('filters users by role via dropdown and search input', async () => {
    render(<ConfirmDialogProvider><AdminDashboard /></ConfirmDialogProvider>);
    await waitFor(() => expect(screen.getByText('pm@test.com')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText('Search by name, email or role…');
    fireEvent.change(searchInput, { target: { value: 'System Admin' } });
    expect(screen.queryByText('pm@test.com')).not.toBeInTheDocument();
    expect(screen.getByText('admin@test.com')).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('pm@test.com')).toBeInTheDocument();

    const selects = screen.getAllByRole('combobox');
    const roleFilterSelect = selects.find(select => {
      const options = Array.from(select.querySelectorAll('option'));
      return options.some(opt => opt.value === '' && opt.textContent === 'All Roles');
    });

    expect(roleFilterSelect).toBeDefined();
    if (roleFilterSelect) {
      fireEvent.change(roleFilterSelect, { target: { value: 'pm' } });
      expect(screen.getByText('pm@test.com')).toBeInTheDocument();
      expect(screen.queryByText('admin@test.com')).not.toBeInTheDocument();
    }
  });

  it('calls deactivateUser or activateUser when confirmed via modal', async () => {
    render(<ConfirmDialogProvider><AdminDashboard /></ConfirmDialogProvider>);
    await waitFor(() => expect(screen.getByText('pm@test.com')).toBeInTheDocument());

    // Deactivate a user — row button opens the confirm modal, modal's action confirms
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    const deactivateConfirms = await screen.findAllByRole('button', { name: 'Deactivate' });
    fireEvent.click(deactivateConfirms[deactivateConfirms.length - 1]);
    await waitFor(() => expect(mockAdminApi['deactivateUser']).toHaveBeenCalledWith('u1'));

    // Reactivate a user
    fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }));
    const reactivateConfirms = await screen.findAllByRole('button', { name: 'Reactivate' });
    fireEvent.click(reactivateConfirms[reactivateConfirms.length - 1]);
    await waitFor(() => expect(mockAdminApi['activateUser']).toHaveBeenCalledWith('u2'));
  });
});

describe('AdminDashboard — Projects tab', () => {
  it('renders projects after switching to Projects tab', async () => {
    render(<ConfirmDialogProvider><AdminDashboard /></ConfirmDialogProvider>);
    await waitFor(() => screen.getByText(/projects Directory/i));
    fireEvent.click(screen.getByText(/projects Directory/i));
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    expect(screen.getByText('ACME')).toBeInTheDocument();
  });

  it('opens the New Project wizard when button clicked', async () => {
    render(<ConfirmDialogProvider><AdminDashboard /></ConfirmDialogProvider>);
    await waitFor(() => screen.getByText(/projects Directory/i));
    fireEvent.click(screen.getByText(/projects Directory/i));
    await waitFor(() => screen.getByText('+ New Project'));
    fireEvent.click(screen.getByText('+ New Project'));
    expect(screen.getByText('New Project Wizard')).toBeInTheDocument();
    expect(screen.getByText('Project Name *')).toBeInTheDocument();
    expect(screen.getByText('Client Name *')).toBeInTheDocument();
  });

  it('shows Change PM button for active projects', async () => {
    render(<ConfirmDialogProvider><AdminDashboard /></ConfirmDialogProvider>);
    fireEvent.click(await screen.findByText(/projects Directory/i));
    await waitFor(() => expect(screen.getByText('Change PM')).toBeInTheDocument());
  });

  it('shows Archive button for active projects', async () => {
    render(<ConfirmDialogProvider><AdminDashboard /></ConfirmDialogProvider>);
    fireEvent.click(await screen.findByText(/projects Directory/i));
    await waitFor(() => expect(screen.getByText('Archive')).toBeInTheDocument());
  });
});
