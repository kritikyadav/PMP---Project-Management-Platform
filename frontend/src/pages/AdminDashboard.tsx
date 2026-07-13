import { useCallback, useEffect, useState, useMemo } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { adminApi, type ProjectRow, type UserRow } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Navbar } from '../components/Navbar.js';
import { ProjectCreationWizard } from '../components/ProjectCreationWizard.js';
import { Card, Button, Badge, Input, Select, Spinner, ErrorBanner, EmptyState, Pagination, Tooltip, useConfirm } from '../components/ui/index.js';
import { usePagination } from '../hooks/usePagination.js';
import { toast } from 'sonner';

const ROLES = ['employee', 'pm', 'program_manager', 'cxo', 'system_admin'] as const;

const ROLE_LABELS: Record<string, string> = {
  employee: 'Employee',
  pm: 'Project Manager',
  program_manager: 'Program Manager',
  cxo: 'CXO',
  system_admin: 'System Admin',
};

function UsersTab() {
  const confirm = useConfirm();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'pm', password: '' });
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'email' | 'name' | 'role' | 'is_active' | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setUsers(await adminApi.listUsers());
    } catch {
      setError('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function validateField(field: 'email' | 'role' | 'password') {
    const nextErrors = { ...fieldErrors };
    if (field === 'email') {
      if (!form.email.trim()) nextErrors.email = 'Email is required.';
      else delete nextErrors.email;
    }
    if (field === 'role') {
      if (!form.role) nextErrors.role = 'Role is required.';
      else delete nextErrors.role;
    }
    if (field === 'password') {
      if (!form.password.trim()) nextErrors.password = 'Password is required.';
      else if (form.password.length < 8) nextErrors.password = 'Password must be at least 8 characters.';
      else if (form.password.length > 50) nextErrors.password = 'Password must be at most 50 characters.';
      else delete nextErrors.password;
    }
    setFieldErrors(nextErrors);
    return nextErrors[field];
  }

  async function handleCreate(event: React.SyntheticEvent) {
    event.preventDefault();
    setFormError('');

    const errors: Record<string, string> = {};
    if (!form.email.trim()) errors.email = 'Email is required.';
    if (!form.role) errors.role = 'Role is required.';
    if (!form.password.trim()) errors.password = 'Password is required.';
    else if (form.password.length < 8) errors.password = 'Password must be at least 8 characters.';
    else if (form.password.length > 50) errors.password = 'Password must be at most 50 characters.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setFormError(Object.values(errors)[0]);
      return;
    }

    setSubmitting(true);
    try {
      await adminApi.createUser({
        email: form.email.trim(),
        name: form.name.trim() || undefined,
        role: form.role,
        password: form.password,
      });
      setForm({ email: '', name: '', role: 'pm', password: '' });
      setFieldErrors({});
      setShowPassword(false);
      setShowForm(false);
      toast.success('User created successfully.');
      await load();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to create user.';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleChangeRole(id: string, email: string, newRole: string) {
    const ok = await confirm({
      title: 'Change role?',
      message: `Change role of ${email} to "${ROLE_LABELS[newRole] ?? newRole}"?`,
      confirmLabel: 'Change role',
    });
    if (!ok) {
      await load();
      return;
    }
    setChangingRoleId(id);
    try {
      await adminApi.changeRole(id, newRole);
      toast.success(`Role updated to ${ROLE_LABELS[newRole] ?? newRole}.`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to change role.');
      await load();
    } finally {
      setChangingRoleId(null);
    }
  }

  async function handleDeactivate(id: string, email: string) {
    const ok = await confirm({
      title: `Deactivate ${email}?`,
      message: 'They will no longer be able to log in.',
      confirmLabel: 'Deactivate',
      destructive: true,
    });
    if (!ok) return;

    try {
      await adminApi.deactivateUser(id);
      toast.success(`${email} deactivated.`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to deactivate user.');
    }
  }

  async function handleActivate(id: string, email: string) {
    const ok = await confirm({
      title: `Reactivate ${email}?`,
      message: 'They will be able to log in again.',
      confirmLabel: 'Reactivate',
    });
    if (!ok) return;

    try {
      await adminApi.activateUser(id);
      toast.success(`${email} reactivated.`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to reactivate user.');
    }
  }

  const handleSort = (field: 'email' | 'name' | 'role' | 'is_active') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const renderSortIcon = (field: 'email' | 'name' | 'role' | 'is_active') => {
    if (sortField !== field) return <span className="ml-1 text-pip-muted/40 select-none">↕</span>;
    return sortOrder === 'asc' ? <span className="ml-1 text-accent select-none">↑</span> : <span className="ml-1 text-accent select-none">↓</span>;
  };

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    const matchesSearch = u.email.toLowerCase().includes(q) ||
      (u.name ?? '').toLowerCase().includes(q) ||
      (ROLE_LABELS[u.role] ?? u.role).toLowerCase().includes(q);
    const matchesRole = !roleFilter || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const sortedUsers = useMemo(() => {
    if (!sortField) return filteredUsers;
    return [...filteredUsers].sort((a, b) => {
      let aVal = '';
      let bVal = '';
      if (sortField === 'email') {
        aVal = a.email.toLowerCase();
        bVal = b.email.toLowerCase();
      } else if (sortField === 'name') {
        aVal = (a.name ?? '').toLowerCase();
        bVal = (b.name ?? '').toLowerCase();
      } else if (sortField === 'role') {
        aVal = (ROLE_LABELS[a.role] ?? a.role).toLowerCase();
        bVal = (ROLE_LABELS[b.role] ?? b.role).toLowerCase();
      } else if (sortField === 'is_active') {
        aVal = a.is_active ? '1' : '0';
        bVal = b.is_active ? '1' : '0';
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredUsers, sortField, sortOrder]);

  const { page, setPage, pageSize, handlePageSizeChange, totalPages, paginated: paginatedUsers, totalItems: totalUsers } = usePagination(sortedUsers);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-sora font-semibold text-lg text-pip-text">User Directory</h2>
        <Button
          variant="primary"
          onClick={() => {
            if (showForm) {
              setForm({ email: '', name: '', role: 'pm', password: '' });
              setFieldErrors({});
              setFormError('');
              setShowPassword(false);
            }
            setShowForm((current) => !current);
          }}
        >
          {showForm ? 'Cancel' : '+ Add User'}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6 p-6 bg-surface-2">
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Email *"
                type="email"
                value={form.email}
                onChange={(event) => {
                  setForm((current) => ({ ...current, email: event.target.value }));
                  setFieldErrors((current) => ({ ...current, email: '' }));
                }}
                onBlur={() => validateField('email')}
                error={fieldErrors.email}
                placeholder="user@company.com"
                required
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-pip-secondary uppercase tracking-wide">
                  Password *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(event) => {
                      setForm((current) => ({ ...current, password: event.target.value }));
                      setFieldErrors((current) => ({ ...current, password: '' }));
                    }}
                    onBlur={() => validateField('password')}
                    className={`w-full rounded-lg border bg-surface-2 px-3 py-2 pr-10 text-sm text-pip-text placeholder:text-pip-muted focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed read-only:bg-surface-1 read-only:text-pip-muted ${fieldErrors.password
                        ? 'border-err-text focus:ring-err-text/30'
                        : 'border-pip-border focus:ring-pip-accent/40 focus:border-pip-accent'
                      }`}
                    placeholder="Min 8 characters"
                    required
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-pip-muted hover:text-pip-text flex items-center justify-center"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <span className="text-xs text-err-text">{fieldErrors.password}</span>
                )}
              </div>
              <Input
                label="Name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Full name (optional)"
              />
              <div>
                <label className="block text-sm font-medium text-pip-text mb-1">Role *</label>
                <Select
                  value={form.role}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, role: event.target.value }));
                    setFieldErrors((current) => ({ ...current, role: '' }));
                  }}
                  onBlur={() => validateField('role')}
                  error={fieldErrors.role}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="primary" type="submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create User'}
              </Button>
            </div>
          </form>
          {formError && <ErrorBanner message={formError} className="mt-4" />}
        </Card>
      )}

      {error && <ErrorBanner message={error} className="mb-6" />}

      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="flex-grow">
          <Input
            placeholder="Search by name, email or role…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            icon={
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
          />
        </div>
        <div className="w-full sm:w-56">
          <Select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Roles</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-pip-border">
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className="bg-surface-2 border-b border-pip-border">
                <th
                  onClick={() => handleSort('email')}
                  className="px-6 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider w-[35%] cursor-pointer hover:bg-surface-3 transition-colors select-none"
                >
                  <div className="flex items-center gap-1">
                    Email {renderSortIcon('email')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('name')}
                  className="px-6 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider w-[20%] cursor-pointer hover:bg-surface-3 transition-colors select-none"
                >
                  <div className="flex items-center gap-1">
                    Name {renderSortIcon('name')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('role')}
                  className="px-6 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider w-48 cursor-pointer hover:bg-surface-3 transition-colors select-none"
                >
                  <div className="flex items-center gap-1">
                    Role {renderSortIcon('role')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('is_active')}
                  className="px-6 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider w-28 cursor-pointer hover:bg-surface-3 transition-colors select-none"
                >
                  <div className="flex items-center gap-1">
                    Status {renderSortIcon('is_active')}
                  </div>
                </th>
                <th className="px-6 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider text-center w-32 select-none">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pip-border bg-surface-1">
              {paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12">
                    <EmptyState message={search ? 'No users match your search.' : 'No users provisioned yet.'} />
                  </td>
                </tr>
              ) : paginatedUsers.map((user) => (
                <tr key={user.id} className={`hover:bg-surface-3 transition-colors ${!user.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-6 py-4 text-sm font-medium text-pip-text">
                    <Tooltip content={user.email}>
                      {user.email}
                    </Tooltip>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-pip-text">
                    {user.name ? (
                      <Tooltip content={user.name}>
                        {user.name}
                      </Tooltip>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <Select
                      value={user.role}
                      disabled={changingRoleId === user.id}
                      onChange={(e) => handleChangeRole(user.id, user.email, e.target.value)}
                      className="text-sm py-1"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <Badge variant={user.is_active ? 'active' : 'inactive'} className="text-sm">
                      {user.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                    {user.is_active ? (
                      <Button variant="danger" size="sm" className="text-sm" onClick={() => handleDeactivate(user.id, user.email)}>
                        Deactivate
                      </Button>
                    ) : (
                      <Button variant="primary" size="sm" className="text-sm" onClick={() => handleActivate(user.id, user.email)}>
                        Reactivate
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={totalUsers}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      )}
    </div>
  );
}

function ProjectsTab() {
  const confirm = useConfirm();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [activePMs, setActivePMs] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignPmId, setAssignPmId] = useState('');
  const [sortField, setSortField] = useState<'name' | 'client_name' | 'pm_name' | 'status' | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [projectRows, pmRows] = await Promise.all([adminApi.listProjects(), adminApi.listUsers('pm')]);
      setProjects(projectRows);
      setActivePMs(pmRows.filter((user) => user.is_active));
    } catch {
      setError('Failed to load projects.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAssignPM(projectId: string) {
    if (!assignPmId) return;

    try {
      await adminApi.assignPM(projectId, assignPmId);
      setAssigningId(null);
      setAssignPmId('');
      toast.success('PM assigned.');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to assign PM.');
    }
  }

  async function handleArchive(id: string, name: string) {
    const ok = await confirm({
      title: `Archive "${name}"?`,
      message: 'It will be hidden from active views.',
      confirmLabel: 'Archive',
      destructive: true,
    });
    if (!ok) return;

    try {
      await adminApi.archiveProject(id);
      toast.success(`"${name}" archived.`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to archive project.');
    }
  }

  async function handleUnarchive(id: string, name: string) {
    const ok = await confirm({
      title: `Unarchive "${name}"?`,
      message: 'It will become active again.',
      confirmLabel: 'Unarchive',
    });
    if (!ok) return;

    try {
      await adminApi.unarchiveProject(id);
      toast.success(`"${name}" unarchived.`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to unarchive project.');
    }
  }

  const handleSort = (field: 'name' | 'client_name' | 'pm_name' | 'status') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const renderSortIcon = (field: 'name' | 'client_name' | 'pm_name' | 'status') => {
    if (sortField !== field) return <span className="ml-1 text-pip-muted/40 select-none">↕</span>;
    return sortOrder === 'asc' ? <span className="ml-1 text-accent select-none">↑</span> : <span className="ml-1 text-accent select-none">↓</span>;
  };

  const filteredProjects = projects.filter((p) => {
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.client_name ?? '').toLowerCase().includes(q);
  });

  const sortedProjects = useMemo(() => {
    if (!sortField) return filteredProjects;
    return [...filteredProjects].sort((a, b) => {
      let aVal = '';
      let bVal = '';
      if (sortField === 'name') {
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
      } else if (sortField === 'client_name') {
        aVal = (a.client_name ?? '').toLowerCase();
        bVal = (b.client_name ?? '').toLowerCase();
      } else if (sortField === 'pm_name') {
        aVal = (a.pm_name ?? a.pm_email ?? '').toLowerCase();
        bVal = (b.pm_name ?? b.pm_email ?? '').toLowerCase();
      } else if (sortField === 'status') {
        aVal = a.status.toLowerCase();
        bVal = b.status.toLowerCase();
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredProjects, sortField, sortOrder]);

  const { page: projPage, setPage: setProjPage, pageSize: projPageSize, handlePageSizeChange: handleProjPageSizeChange, totalPages: projTotalPages, paginated: paginatedProjects, totalItems: totalProjects } = usePagination(sortedProjects);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-sora font-semibold text-lg text-pip-text">Project Directory</h2>
        <Button variant="primary" onClick={() => setShowWizard(true)}>
          + New Project
        </Button>
      </div>

      {error && <ErrorBanner message={error} className="mb-6" />}

      <div className="mb-6">
        <Input
          placeholder="Search by project or client…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setProjPage(1); }}
          icon={
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          }
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-pip-border">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-2 border-b border-pip-border">
                <th
                  onClick={() => handleSort('name')}
                  className="px-6 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider cursor-pointer hover:bg-surface-3 transition-colors select-none"
                >
                  <div className="flex items-center gap-1">
                    Project Name {renderSortIcon('name')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('client_name')}
                  className="px-6 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider cursor-pointer hover:bg-surface-3 transition-colors select-none"
                >
                  <div className="flex items-center gap-1">
                    Client {renderSortIcon('client_name')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('pm_name')}
                  className="px-6 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider cursor-pointer hover:bg-surface-3 transition-colors select-none"
                >
                  <div className="flex items-center gap-1">
                    Assigned PM {renderSortIcon('pm_name')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('status')}
                  className="px-6 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider cursor-pointer hover:bg-surface-3 transition-colors select-none"
                >
                  <div className="flex items-center gap-1">
                    Status {renderSortIcon('status')}
                  </div>
                </th>
                <th className="px-6 py-3 text-xs font-semibold text-pip-secondary uppercase tracking-wider text-center w-48 select-none">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pip-border bg-surface-1">
              {paginatedProjects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12">
                    <EmptyState message={search ? 'No projects match your search.' : 'No active projects.'} />
                  </td>
                </tr>
              ) : paginatedProjects.map((project) => (
                <tr key={project.id} className="hover:bg-surface-3 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-pip-text">{project.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-pip-text">{project.client_name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {assigningId === project.id ? (
                      <div className="flex items-center gap-2">
                        <Select
                          value={assignPmId}
                          onChange={(event) => setAssignPmId(event.target.value)}
                        >
                          <option value="">Select PM</option>
                          {activePMs.map((pm) => (
                            <option key={pm.id} value={pm.id}>{pm.name ?? pm.email}</option>
                          ))}
                        </Select>
                        <Button
                          variant="primary"
                          size="sm"
                          className="text-sm"
                          disabled={assignPmId === (project.assigned_pm_id ?? '')}
                          onClick={() => handleAssignPM(project.id)}
                        >
                          Save
                        </Button>
                        <Button variant="ghost" size="sm" className="text-sm" onClick={() => { setAssigningId(null); setAssignPmId(''); }}>Cancel</Button>
                      </div>
                    ) : (
                      <span className={project.pm_name ? 'text-pip-text' : 'text-pip-muted italic'}>
                        {project.pm_name ?? project.pm_email ?? 'Unassigned'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <Badge variant={project.status === 'active' ? 'active' : 'inactive'} className="text-sm">
                      {project.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                    <div className="flex items-center justify-center gap-2">
                      {project.status === 'active' && (
                        <>
                          <Button variant="secondary" size="sm" className="change-pm-btn text-sm" onClick={() => { setAssigningId(project.id); setAssignPmId(project.assigned_pm_id ?? ''); }}>
                            Change PM
                          </Button>
                          <Button variant="danger" size="sm" className="text-sm" onClick={() => handleArchive(project.id, project.name)}>
                            Archive
                          </Button>
                        </>
                      )}
                      {project.status === 'archived' && (
                        <Button variant="primary" size="sm" className="text-sm" onClick={() => handleUnarchive(project.id, project.name)}>
                          Unarchive
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={projPage}
            totalPages={projTotalPages}
            pageSize={projPageSize}
            totalItems={totalProjects}
            onPageChange={setProjPage}
            onPageSizeChange={handleProjPageSizeChange}
          />
        </div>
      )}

      <ProjectCreationWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onSuccess={() => {
          setShowWizard(false);
          load();
        }}
      />
    </div>
  );
}

type Tab = 'users' | 'projects';

export function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('users');

  return (
    <div className="min-h-screen bg-base">
      <Navbar title="System Administrator" />
      <main className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">

        <header className="mb-8">
          <h1 className="font-sora font-bold text-3xl text-pip-text mb-2 tracking-tight">Platform Administration</h1>
          <p className="text-pip-secondary text-base">Manage system access, roles, and project portfolios.</p>
        </header>

        <div className="flex border-b border-pip-border mb-8">
          {(['users', 'projects'] as Tab[]).map((currentTab) => (
            <button
              key={currentTab}
              onClick={() => setTab(currentTab)}
              className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 capitalize ${tab === currentTab
                  ? 'border-accent text-accent'
                  : 'border-transparent text-pip-secondary hover:text-pip-text hover:border-pip-border'
                }`}
            >
              {currentTab} Directory
            </button>
          ))}
        </div>

        <Card className="p-8">
          {tab === 'users' ? <UsersTab /> : <ProjectsTab />}
        </Card>
      </main>
    </div>
  );
}
