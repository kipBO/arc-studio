import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { PasswordInput, SelectInput, TextInput } from '../ui/Inputs.jsx';
import { Activity, KeyRound, Shield, SlidersHorizontal, Trash2, UserPlus, Users } from 'lucide-react';
import { arcEvents } from '../../core/ArcEvents.js';
import { apiUrl } from '../../core/api.js';
//
async function readApiResponse(response) {
  const body = await response.text();
  try { return body ? JSON.parse(body) : {}; }
  catch {
    const detail = response.ok
      ? 'The server returned a page instead of an API response.'
      : `The request failed (${response.status}) and the server returned a page instead of an API response.`;
    throw new Error(detail);
  }
}

const ROLE_OPTIONS = [
  { value: 'editor', label: 'Editor · Graphs and simulation' },
  { value: 'operator', label: 'Operator · Gateway and emojis' },
  { value: 'viewer', label: 'Viewer · Read only' },
  { value: 'admin', label: 'Admin · Full access' }
];

const PERMISSION_OPTIONS = [
  { value: 'graphs:read', label: 'View graphs', detail: 'Open and inspect workspace graphs.' },
  { value: 'graphs:write', label: 'Edit graphs', detail: 'Create, change, and save graphs and variables.' },
  { value: 'simulation:run', label: 'Run simulations', detail: 'Use the offline simulator and debugger.' },
  { value: 'logs:read', label: 'View logs', detail: 'Read workspace and bot logs.' },
  { value: 'bot:control', label: 'Control bot', detail: 'Connect or disconnect the Discord gateway.' },
  { value: 'emojis:upload', label: 'Manage emojis', detail: 'Upload and manage application emojis.' }
];

export function UserManagementModal({ isOpen, onClose, authToken, currentUsername = '' }) {
  const [users, setUsers] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('editor');
  const [formErrors, setFormErrors] = useState({});
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [editingUserId, setEditingUserId] = useState('');
  const [permissionDraft, setPermissionDraft] = useState([]);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const createFormRef = useRef(null);

  const shakeInvalidFields = () => {
    const form = createFormRef.current;
    if (!form) return;
    form.querySelectorAll('.field-group').forEach((field) => {
      if (!field.querySelector('[aria-invalid="true"]')) return;
      field.classList.remove('field-shake');
      void field.offsetWidth;
      field.classList.add('field-shake');
      window.setTimeout(() => field.classList.remove('field-shake'), 360);
    });
  };

  const fetchUsers = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/users'), { headers: { 'x-arc-token': authToken } });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Could not load accounts.');
      setUsers(data.users || []);
      if ((data.users || []).length > 1) {
        setActivity([]);
        const activityResponse = await fetch(apiUrl('/api/activity?limit=50'), { headers: { 'x-arc-token': authToken } });
        const activityData = await activityResponse.json();
        if (activityResponse.ok) setActivity(activityData.activity || []);
      } else setActivity([]);
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Team access', message: error.message, type: 'error' });
    } finally { setLoading(false); }
  }, [authToken]);

  useEffect(() => { if (isOpen) fetchUsers(); }, [isOpen, fetchUsers]);

  const createUser = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!newUsername.trim()) nextErrors.username = 'Enter a username.';
    else if (newUsername.trim().length < 2) nextErrors.username = 'Use at least 2 characters.';
    if (!newPassword) nextErrors.password = 'Enter a password.';
    else if (newPassword.length < 6) nextErrors.password = 'Use at least 6 characters.';
    if (Object.keys(nextErrors).length) {
      setFormErrors(nextErrors);
      requestAnimationFrame(shakeInvalidFields);
      return;
    }
    if (!newUsername.trim() || !newPassword || !authToken) return;
    setCreating(true);
    try {
      const response = await fetch(apiUrl('/api/users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ username: newUsername.trim(), password: newPassword, role: newRole })
      });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Could not create this account.');
      setNewUsername(''); setNewPassword(''); setNewRole('editor'); setFormErrors({});
      await fetchUsers();
      arcEvents.emit('toast:notify', { title: 'Account created', message: data.user.username, type: 'success' });
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Account not created', message: error.message, type: 'error' });
    } finally { setCreating(false); }
  };

  const deleteUser = async (user) => {
    if (!authToken) return;
    try {
      const response = await fetch(apiUrl(`/api/users/${encodeURIComponent(user.id)}`), { method: 'DELETE', headers: { 'x-arc-token': authToken } });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Could not remove this account.');
      await fetchUsers();
      arcEvents.emit('toast:notify', { title: 'Access removed', message: user.username, type: 'info' });
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Account not removed', message: error.message, type: 'error' });
    }
  };

  const resetUserPassword = async (event) => {
    event.preventDefault();
    if (!resetTarget || !authToken) return;
    if (resetPassword.length < 6) return setResetError('Use at least 6 characters.');
    if (resetPassword !== resetConfirmPassword) return setResetError('Passwords do not match.');
    setResetting(true); setResetError('');
    try {
      const response = await fetch(apiUrl(`/api/users/${encodeURIComponent(resetTarget.id)}/reset-password`), {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ password: resetPassword, confirmPassword: resetConfirmPassword })
      });
        const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Could not reset this password.');
      setResetTarget(null); setResetPassword(''); setResetConfirmPassword('');
      arcEvents.emit('toast:notify', { title: 'Password reset', message: `${resetTarget.username} will choose a new password at next sign-in.`, type: 'success' });
    } catch (error) { setResetError(error.message || 'Could not reset this password.'); }
    finally { setResetting(false); }
  };

  const startPermissionEdit = (user) => {
    const current = Array.isArray(user.permissions) ? user.permissions : [];
    setPermissionDraft(current.includes('*') ? PERMISSION_OPTIONS.map((item) => item.value) : current);
    setEditingUserId(user.id);
  };

  const saveUserPermissions = async (user) => {
    if (!authToken || savingPermissions) return;
    setSavingPermissions(true);
    try {
      const response = await fetch(apiUrl(`/api/users/${encodeURIComponent(user.id)}/permissions`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-arc-token': authToken },
        body: JSON.stringify({ permissions: permissionDraft })
      });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Could not update permissions.');
      setEditingUserId('');
      await fetchUsers();
      arcEvents.emit('toast:notify', { title: 'Permissions updated', message: `${user.username} must sign in again for the changes to take effect.`, type: 'success' });
    } catch (error) {
      arcEvents.emit('toast:notify', { title: 'Permissions not updated', message: error.message, type: 'error' });
    } finally { setSavingPermissions(false); }
  };

  return <Modal isOpen={isOpen} onClose={onClose} title="Team access" subtitle="Manage studio accounts and roles" icon={Users} maxWidth="max-w-2xl">
    <form ref={createFormRef} className="team-create-form" noValidate onSubmit={createUser}>
      <div className="team-form-title"><span><UserPlus size={16} /></span><div><strong>Add a member</strong><small>Create a separate sign-in for a collaborator.</small></div></div>
      <div className="team-form-grid">
        <TextInput label="Username" placeholder="Username" value={newUsername} onChange={(event) => { setNewUsername(event.target.value); setFormErrors((current) => ({ ...current, username: '' })); }} error={formErrors.username} minLength={2} autoComplete="off" />
        <PasswordInput label="Initial password" placeholder="At least 6 characters" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setFormErrors((current) => ({ ...current, password: '' })); }} error={formErrors.password} showStrength minLength={6} autoComplete="new-password" />
      </div>
      <SelectInput label="Role" value={newRole} options={ROLE_OPTIONS} onChange={setNewRole} />
      <Button type="submit" variant="primary" loading={creating} icon={UserPlus}>Create account</Button>
    </form>
    <section className="team-list-section">
      <div className="team-list-heading"><h3><Shield size={15} /> Accounts</h3><span>{users.length}</span></div>
      {loading && users.length === 0 ? <div className="team-empty">Loading accounts…</div> : users.length === 0 ? <div className="team-empty">No additional accounts</div> : <div className="team-list">
        {users.map((user) => {
          const primary = Boolean(user.isPrimaryAdmin);
          return <article className="team-user-entry" key={user.id}>
            <div className="team-user-row">
              <span className="team-avatar">{(user.username?.[0] || 'U').toUpperCase()}</span>
              <div className="team-user-copy"><strong>{user.username}{primary && <small>Primary</small>}</strong><span><i className={`role-dot role-${user.role}`} />{user.role === 'custom' ? 'Custom permissions' : user.role} <em>· {String(user.id).slice(0, 8)}</em></span><small className="team-last-login">Last sign-in: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</small></div>
              <div className="team-user-actions">{!primary && user.username !== currentUsername && <><button className="icon-button" onClick={() => startPermissionEdit(user)} title={`Edit ${user.username} permissions`} aria-label={`Edit ${user.username} permissions`}><SlidersHorizontal size={15} /></button><button className="icon-button" onClick={() => { setResetTarget(user); setResetPassword(''); setResetConfirmPassword(''); setResetError(''); }} title={`Reset ${user.username} password`} aria-label={`Reset ${user.username} password`}><KeyRound size={15} /></button></>}{!primary && <button className="icon-button team-delete-button" onClick={() => deleteUser(user)} title={`Remove ${user.username}`} aria-label={`Remove ${user.username}`}><Trash2 size={15} /></button>}</div>
            </div>
            {editingUserId === user.id && <div className="team-permissions-editor">
              <div className="team-permissions-heading"><strong>Workspace permissions</strong><small>Selecting every permission grants full Admin access, including Team access. Changes sign this member out so the new access takes effect.</small></div>
              <div className="team-permissions-grid">{PERMISSION_OPTIONS.map((permission) => <label className="team-permission-option" key={permission.value}>
                <input type="checkbox" checked={permissionDraft.includes(permission.value)} onChange={(event) => setPermissionDraft((current) => event.target.checked ? [...current, permission.value] : current.filter((item) => item !== permission.value))} />
                <span><strong>{permission.label}</strong><small>{permission.detail}</small></span>
              </label>)}</div>
              <div className="team-permissions-actions"><Button type="button" variant="secondary" disabled={savingPermissions} onClick={() => setEditingUserId('')}>Cancel</Button><Button type="button" loading={savingPermissions} onClick={() => saveUserPermissions(user)}>Save permissions</Button></div>
            </div>}
          </article>;
        })}
      </div>}
    </section>
    {resetTarget && <form className="team-create-form" onSubmit={resetUserPassword}>
      <div className="team-form-title"><span><KeyRound size={16} /></span><div><strong>Reset {resetTarget.username}’s password</strong><small>They must choose a new password before continuing.</small></div></div>
      <PasswordInput label="Temporary password" placeholder="At least 6 characters" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} minLength={6} autoComplete="new-password" />
      <PasswordInput label="Confirm temporary password" placeholder="Confirm password" value={resetConfirmPassword} onChange={(event) => setResetConfirmPassword(event.target.value)} minLength={6} autoComplete="new-password" />
      {resetError && <p className="form-error" role="alert">{resetError}</p>}
      <div className="team-reset-actions"><Button type="button" variant="secondary" onClick={() => setResetTarget(null)}>Cancel</Button><Button type="submit" loading={resetting}>Reset password</Button></div>
    </form>}
    {users.length > 1 && <section className="team-activity-section">
      <div className="team-list-heading"><h3><Activity size={15} /> Recent activity</h3><span>{activity.length}</span></div>
      {activity.length ? <div className="team-activity-list">{activity.map((entry) => <article className="team-activity-row" key={entry.id}>
        <div><strong>{entry.summary}</strong><small>{entry.actor?.username || 'Unknown user'} · {new Date(entry.timestamp).toLocaleString()}</small>
          {entry.details?.changedNodes?.length > 0 && <small className="team-activity-node-list">{entry.details.changedNodes.slice(0, 5).map((node) => `${node.change} ${node.name}${node.fields?.length ? ` (${node.fields.join(', ')})` : ''}`).join(' · ')}{entry.details.changedNodes.length > 5 ? ` · +${entry.details.changedNodes.length - 5} more` : ''}</small>}
          {entry.details?.blockTypes?.length > 0 && <small className="team-activity-node-list">Blocks: {entry.details.blockTypes.join(' · ')}</small>}
        </div>
      </article>)}</div> : <div className="team-empty">No activity recorded yet</div>}
    </section>}
  </Modal>;
}
