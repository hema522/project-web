import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard, FolderKanban, CheckSquare, Users, Settings, Search, Plus,
  Bell, MoreHorizontal, Clock3, CircleCheck, LogOut, Menu, X, MessageSquare,
  ShieldCheck, ArrowRight, RefreshCw, Archive, Trash2, Send, ChevronDown, UserRound, Mail, CalendarDays, CircleUserRound
} from 'lucide-react';
import './style.css';

const initialToken = localStorage.getItem('project-web-token') || '';
const roleLabels = { admin: 'Admin', manager: 'Project Manager', member: 'Team Member', viewer: 'Viewer' };
const roleCanCreateTasks = role => ['admin','manager'].includes(role);

async function api(path, options = {}) {
  const token = localStorage.getItem('project-web-token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'Request failed.');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function App() {
  const [token, setToken] = useState(initialToken);
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('Overview');
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [team, setTeam] = useState([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [memberProject, setMemberProject] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [viewingProfile, setViewingProfile] = useState(null);
  const [loginError, setLoginError] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [loadError, setLoadError] = useState('');

  const logout = useCallback(() => {
    localStorage.removeItem('project-web-token');
    setToken(''); setUser(null); setProjects([]); setTasks([]); setTeam([]);
  }, []);

  const loadData = useCallback(async () => {
    if (!token) return;
    setBusy(true); setLoadError('');
    try {
      const [p,t,m,me] = await Promise.all([
        api('/api/projects'), api('/api/tasks'), api('/api/team'), api('/api/auth/me')
      ]);
      setProjects(p); setTasks(t); setTeam(m); setUser(me.user);
    } catch (e) {
      if (e.status === 401) { logout(); return; }
      setLoadError(e.message);
    } finally { setBusy(false); }
  }, [token, logout]);

  useEffect(() => { loadData(); }, [loadData]);

  const notify = message => { setNotice(message); window.setTimeout(() => setNotice(''), 3500); };
  const filteredProjects = useMemo(() => projects.filter(p => p.name.toLowerCase().includes(query.toLowerCase())), [projects,query]);
  const filteredTasks = useMemo(() => tasks.filter(t => `${t.title} ${t.project} ${t.assignee || ''}`.toLowerCase().includes(query.toLowerCase())), [tasks,query]);
  const completed = tasks.filter(t => t.status === 'Done').length;
  const inProgress = tasks.filter(t => t.status === 'In progress').length;

  async function handleLogin(email,password) {
    setLoginError('');
    try {
      const data = await api('/api/auth/login', {method:'POST',body:JSON.stringify({email,password})});
      localStorage.setItem('project-web-token',data.token);
      setToken(data.token); setUser(data.user);
    } catch(e) { setLoginError(e.message); }
  }

  async function createProject(form) {
    try {
      await api('/api/projects',{method:'POST',body:JSON.stringify(form)});
      setShowProjectForm(false); await loadData(); setPage('Projects'); notify('Project created.');
    } catch(e) { notify(e.message); }
  }
  async function createTask(form) {
    try {
      await api('/api/tasks',{method:'POST',body:JSON.stringify(form)});
      setShowTaskForm(false); await loadData(); notify('Task created.');
    } catch(e) { notify(e.message); }
  }
  async function changeStatus(task) {
    const order = ['To do','In progress','Done'];
    const status = order[(order.indexOf(task.status)+1)%order.length];
    try {
      const updated = await api(`/api/tasks/${task.id}`,{method:'PUT',body:JSON.stringify({version:task.version,status})});
      await loadData();
      if (selectedTask?.id === task.id) setSelectedTask(updated);
      notify(`Task moved to ${status}.`);
    } catch(e) {
      if (e.status === 409) { await loadData(); notify('This task changed elsewhere. The latest version has been loaded.'); }
      else notify(e.message);
    }
  }
  async function deleteTask(task) {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    try { await api(`/api/tasks/${task.id}`,{method:'DELETE'}); setSelectedTask(null); await loadData(); notify('Task deleted.'); }
    catch(e) { notify(e.message); }
  }
  async function archiveProject(project) {
    if (!window.confirm(`Archive "${project.name}"?`)) return;
    try { await api(`/api/projects/${project.id}/archive`,{method:'PATCH'}); await loadData(); notify('Project archived.'); }
    catch(e) { notify(e.message); }
  }
  async function createUser(form) {
    try { await api('/api/users',{method:'POST',body:JSON.stringify(form)}); setShowUserForm(false); await loadData(); notify('User created.'); }
    catch(e) { notify(e.message); }
  }
  async function updateUser(id, patch) {
    try { await api(`/api/users/${id}`,{method:'PATCH',body:JSON.stringify(patch)}); await loadData(); notify('User updated.'); }
    catch(e) { notify(e.message); }
  }
  async function saveUserName(id, name) {
    try {
      await api(`/api/users/${id}`, {method:'PATCH', body:JSON.stringify({name})});
      setEditingUser(null);
      await loadData();
      notify('Name updated successfully.');
    } catch(e) { notify(e.message); }
  }

  if (!token || !user) return <Login onLogin={handleLogin} error={loginError} loading={busy} />;

  const nav = [
    { label:'Overview', icon:LayoutDashboard },
    { label:'Projects', icon:FolderKanban },
    { label:'My Tasks', icon:CheckSquare },
    { label:'Team', icon:Users }
  ];

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav?'open':''}`}>
      <div className="brand"><div className="brand-mark">P</div><span>project <b>web</b><span className="brand-dot">.</span></span></div>
      <div className="workspace-label">WORKSPACE</div>
      <div className="workspace"><div className="workspace-icon">P</div><div><strong>Project Web Team</strong><small>Local workspace</small></div><MoreHorizontal size={18}/></div>
      <nav>{nav.map(({label,icon:Icon})=><button key={label} className={`nav-item ${page===label?'active':''}`} onClick={()=>{setPage(label);setMobileNav(false)}}><Icon size={18}/>{label}{label==='My Tasks'&&<span className="nav-count">{tasks.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom">
        <button className="nav-item" onClick={()=>setViewingProfile(user)}><Settings size={18}/>My profile</button>
        <div className="profile"><button className="profile-open" onClick={()=>setViewingProfile(user)} title="View my profile"><Avatar user={user}/></button><button className="profile-identity" onClick={()=>setViewingProfile(user)}><strong>{user.name}</strong><small>{roleLabels[user.role]}</small></button><button className="logout-button" onClick={logout} title="Sign out"><LogOut size={17}/></button></div>
      </div>
    </aside>
    <main className="main">
      <header className="topbar">
        <button className="mobile-menu" onClick={()=>setMobileNav(!mobileNav)}><Menu/></button>
        <div className="breadcrumbs">Workspace <span>/</span> <strong>{page}</strong></div>
        <div className="top-actions">
          <label className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search projects and tasks..." /></label>
          <button className="icon-button" onClick={()=>notify('You are all caught up.')} aria-label="Notifications"><Bell size={18}/></button>
          <button className="top-avatar-button" onClick={()=>setViewingProfile(user)} title="View my profile"><Avatar user={user}/></button>
        </div>
      </header>
      <div className="content">
        {notice&&<div className="notice">{notice}<button onClick={()=>setNotice('')}><X size={15}/></button></div>}
        {loadError&&<div className="error-banner">{loadError}<button onClick={loadData}>Try again</button></div>}
        <div className="page-heading">
          <div><div className="eyebrow">YOUR TEAM WORKSPACE</div><h1>{page==='Overview'?`Welcome back, ${user.name.split(' ')[0]}`:page}</h1><p>{page==='Overview'?'Here’s a simple overview of your team’s work.':page==='Projects'?'Projects you can access in this workspace.':page==='My Tasks'?'Tasks available to you based on your role.':'People in your workspace.'}</p></div>
          <div className="heading-actions">
            {roleCanCreateTasks(user.role)&&<button className="button secondary" onClick={()=>setShowTaskForm(true)}><Plus size={16}/> New task</button>}
            {user.role==='admin'&&page==='Team'&&<button className="button secondary" onClick={()=>setShowUserForm(true)}><Plus size={16}/> New user</button>}
            {user.role==='admin'&&<button className="button primary" onClick={()=>setShowProjectForm(true)}><Plus size={16}/> New project</button>}
          </div>
        </div>
        {busy&&<div className="loading-line"><span/>Loading your workspace…</div>}
        {page==='Overview'&&<>
          <section className="stats-grid">
            <Stat title="Accessible projects" value={projects.length} note="Projects you can view" icon={FolderKanban} tone="violet"/>
            <Stat title="Tasks in progress" value={inProgress} note="Work currently underway" icon={Clock3} tone="blue"/>
            <Stat title="Tasks completed" value={completed} note={`${tasks.length?Math.round(completed/tasks.length*100):0}% of visible tasks`} icon={CircleCheck} tone="green"/>
            <Stat title="Team members" value={team.length} note="People in your workspace" icon={Users} tone="orange"/>
          </section>
          <section className="section">
            <div className="section-title"><div><h2>Your projects</h2><p>Work grouped into projects.</p></div><button className="text-button" onClick={()=>setPage('Projects')}>View all projects →</button></div>
            <div className="project-grid">{projects.slice(0,3).map(p=><ProjectCard key={p.id} project={p} canArchive={user.role==='admin'} canManageMembers={['admin','manager'].includes(user.role)} onArchive={archiveProject} onManageMembers={()=>setMemberProject(p)} onOpen={()=>{setPage('My Tasks');setQuery(p.name)}}/>)}</div>
            {!projects.length&&<Empty text="No projects yet."/>}
          </section>
          <section className="section">
            <div className="section-title"><div><h2>Recent tasks</h2><p>Click the checkbox or status to move a task forward.</p></div><button className="text-button" onClick={()=>setPage('My Tasks')}>View all tasks →</button></div>
            <TaskTable tasks={filteredTasks.slice(0,5)} role={user.role} onCycle={changeStatus} onOpen={setSelectedTask}/>
            {!filteredTasks.length&&<Empty text="No tasks available for your account."/>}
          </section>
        </>}
        {page==='Projects'&&<section className="section"><div className="project-grid">{filteredProjects.map(p=><ProjectCard key={p.id} project={p} canArchive={user.role==='admin'} canManageMembers={['admin','manager'].includes(user.role)} onArchive={archiveProject} onManageMembers={()=>setMemberProject(p)} onOpen={()=>{setPage('My Tasks');setQuery(p.name)}}/>)}</div>{!filteredProjects.length&&<Empty text="No projects match your search."/>}</section>}
        {page==='My Tasks'&&<section className="section"><TaskTable tasks={filteredTasks} role={user.role} onCycle={changeStatus} onOpen={setSelectedTask}/>{!filteredTasks.length&&<Empty text="No tasks match your search or role permissions."/>}</section>}
        {page==='Team'&&<section className="section"><div className="team-grid">{team.map(member=><div className="team-card" key={member.id}><button className="team-profile-open" onClick={()=>setViewingProfile(member)} title={`View ${member.name}'s profile`}><Avatar user={member}/></button><div className="team-card-info"><button className="team-name-button" onClick={()=>setViewingProfile(member)}>{member.name}</button><p>{member.email}</p></div>{user.role==='admin'?<select className="role-select" aria-label={`Role for ${member.name}`} value={member.role} onChange={e=>updateUser(member.id,{role:e.target.value})}><option value="admin">Admin</option><option value="manager">Project Manager</option><option value="member">Team Member</option><option value="viewer">Viewer</option></select>:<span className={`role-pill role-${member.role}`}>{roleLabels[member.role]||member.role}</span>}{member.active===false&&<span className="inactive-pill">Inactive</span>}<button className="mini-action view-profile-action" onClick={()=>setViewingProfile(member)}>View profile</button>{user.role==='admin'&&<button className="mini-action edit-name-action" onClick={()=>setEditingUser(member)}>Edit name</button>}{user.role==='admin'&&<button className="mini-action" onClick={()=>updateUser(member.id,{active:member.active===false})}>{member.active===false?'Activate':'Deactivate'}</button>}</div>)}</div>{!team.length&&<Empty text="No team members found."/>}</section>}
        <footer>Simple project management, in one place <span>•</span> Project Web</footer>
      </div>
    </main>
    {showProjectForm&&<ProjectForm onClose={()=>setShowProjectForm(false)} onSubmit={createProject}/>}
    {showTaskForm&&<TaskForm projects={projects} team={team} onClose={()=>setShowTaskForm(false)} onSubmit={createTask}/>}
    {showUserForm&&<UserForm onClose={()=>setShowUserForm(false)} onSubmit={createUser}/>}
    {memberProject&&<ManageMembersModal project={memberProject} team={team} onClose={()=>setMemberProject(null)} onChanged={loadData} notify={notify}/>}
    {selectedTask&&<TaskDetails task={selectedTask} user={user} onClose={()=>setSelectedTask(null)} onCycle={changeStatus} onDelete={deleteTask} onRefresh={loadData} notify={notify}/>}
    {viewingProfile&&<UserProfile user={viewingProfile} tasks={tasks} projects={projects} onClose={()=>setViewingProfile(null)} isSelf={viewingProfile.id===user.id}/>}
    {editingUser&&<EditUserName user={editingUser} onClose={()=>setEditingUser(null)} onSave={saveUserName}/> }
  </div>;
}

function Login({onLogin,error,loading}) {
  const [email,setEmail]=useState('admin@projectweb.local');
  const [password,setPassword]=useState('password123');
  return <div className="login-page">
    <div className="login-decoration decoration-one"/><div className="login-decoration decoration-two"/>
    <div className="login-panel">
      <div className="brand login-brand"><div className="brand-mark">P</div><span>project <b>web</b><span className="brand-dot">.</span></span></div>
      <div className="eyebrow">YOUR WORKSPACE, SIMPLIFIED</div><h1>Get things done<br/>together.</h1><p className="login-subtitle">Projects, tasks, and your team — all in one simple place.</p>
      <form className="login-form" onSubmit={e=>{e.preventDefault();onLogin(email,password)}}>
        <label>Email address</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/>
        <label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/>
        {error&&<div className="login-error">{error}</div>}
        <button className="button primary login-submit" disabled={loading}>{loading?'Signing in…':'Sign in'} <ArrowRight size={16}/></button>
      </form>
      <div className="demo-box"><div className="demo-heading"><ShieldCheck size={16}/> Demo sign-ins</div>
        <div className="demo-buttons">{[
          ['Admin','admin@projectweb.local'],['Manager','manager@projectweb.local'],['Member','member@projectweb.local'],['Viewer','viewer@projectweb.local']
        ].map(([label,value])=><button key={value} onClick={()=>{setEmail(value);setPassword('password123')}}>{label}</button>)}</div>
        <small>Password for all demo accounts: <b>password123</b></small>
      </div>
    </div>
    <div className="login-side"><div className="side-orbit orbit-a"/><div className="side-orbit orbit-b"/><div className="side-copy"><div className="side-badge"><span/> SIMPLE. CLEAR. CONNECTED.</div><h2>Good work<br/>happens together.</h2><p>A lightweight project hub to help your team focus on what matters.</p><div className="side-feature"><span><FolderKanban size={18}/></span><div><b>Keep projects organized</b><small>Know what’s in progress and what’s next.</small></div></div><div className="side-feature"><span><ShieldCheck size={18}/></span><div><b>Right access for each role</b><small>Server-side permissions keep actions in check.</small></div></div></div></div>
  </div>;
}
function Avatar({user}) {
  const initials=(user?.name||'U').split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase();
  const tone=({admin:'avatar-purple',manager:'avatar-blue',member:'avatar-green',viewer:'avatar-orange'})[user?.role]||'avatar-purple';
  return <div className={`avatar ${tone}`} title={user?.name||''}>{initials}</div>;
}
function Stat({title,value,note,icon:Icon,tone}) { return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={19}/></div><div className="stat-title">{title}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>; }
function ProjectCard({project:p,canArchive,canManageMembers,onArchive,onManageMembers,onOpen}) {
  const percent=p.tasks?Math.round(p.done/p.tasks*100):0;
  const colors=['purple','blue','orange','green']; const color=colors[(Number(p.id)-1)%colors.length];
  return <article className="project-card">
    <div className="project-card-top"><button className={`project-icon ${color}`} onClick={onOpen}><FolderKanban size={19}/></button><div className="project-menu">{canManageMembers&&<button className="dots" title="Manage project members" onClick={()=>onManageMembers(p)}><Users size={16}/></button>}{canArchive&&<button className="dots" title="Archive project" onClick={()=>onArchive(p)}><Archive size={16}/></button>}</div></div>
    <button className="project-card-title" onClick={onOpen}>{p.name}</button><p className="project-desc">{p.description||'No description added yet.'}</p>
    <div className="project-status"><span className={`status-dot ${p.status==='Planning'?'gray':''}`}/>{p.status}<span className="task-total">{p.tasks||0} tasks</span></div>
    <div className="progress-label"><span>Progress</span><strong>{percent}%</strong></div><div className="progress-track"><div style={{width:`${percent}%`}}/></div>
    <div className="project-footer"><span>{p.done||0} of {p.tasks||0} completed</span><button className="text-button small" onClick={onOpen}>View tasks →</button></div>
  </article>;
}
function TaskTable({tasks,role,onCycle,onOpen}) {
  return <div className="table-wrap"><table><thead><tr><th>Task</th><th>Project</th><th>Assignee</th><th>Due date</th><th>Status</th></tr></thead><tbody>
    {tasks.map(t=><tr key={t.id}>
      <td><button className="task-title" onClick={()=>onOpen(t)}><span className={`task-check ${t.status==='Done'?'checked':''}`}>{t.status==='Done'?'✓':''}</span><span className={t.status==='Done'?'done-text':''}>{t.title}</span></button></td>
      <td><span className="project-name">{t.project}</span></td>
      <td><span className="assignee"><span className="mini-avatar">{(t.assignee||'Unassigned').split(' ').map(x=>x[0]).join('').slice(0,2)}</span>{t.assignee||'Unassigned'}</span></td>
      <td className="due-date">{t.due_date||'—'}</td>
      <td><button className={`pill ${t.status.toLowerCase().replace(' ','-')}`} onClick={()=>onCycle(t)} disabled={role==='viewer'} title="Click to change status">{t.status}</button></td>
    </tr>)}
  </tbody></table></div>;
}
function Empty({text}) { return <div className="empty">{text}</div>; }

function ProjectForm({onClose,onSubmit}) {
  const [name,setName]=useState(''); const [description,setDescription]=useState('');
  return <Modal title="Create a project" onClose={onClose}><form onSubmit={e=>{e.preventDefault();onSubmit({name,description})}} className="form-grid">
    <label>Project name</label><input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Website redesign" required maxLength={100}/>
    <label>Description</label><textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="What is this project about?" rows="3" maxLength={500}/>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Create project</button></div>
  </form></Modal>;
}
function TaskForm({projects,team,onClose,onSubmit}) {
  const [title,setTitle]=useState(''); const [description,setDescription]=useState(''); const [projectId,setProjectId]=useState(projects[0]?.id||'');
  const [assigneeId,setAssigneeId]=useState(''); const [dueDate,setDueDate]=useState('');
  const [members,setMembers]=useState([]);
  useEffect(()=>{let done=false; if(projectId){api(`/api/projects/${projectId}/members`).then(x=>{if(!done)setMembers(x)}).catch(()=>setMembers([]));}return()=>{done=true}},[projectId]);
  return <Modal title="Create a task" onClose={onClose}><form onSubmit={e=>{e.preventDefault();onSubmit({title,description,project_id:Number(projectId),assignee_id:assigneeId?Number(assigneeId):null,due_date:dueDate||null})}} className="form-grid">
    <label>Task title</label><input autoFocus value={title} onChange={e=>setTitle(e.target.value)} placeholder="What needs to be done?" required maxLength={160}/>
    <label>Project</label><select value={projectId} onChange={e=>setProjectId(e.target.value)} required>{projects.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select>
    <label>Assignee</label><select value={assigneeId} onChange={e=>setAssigneeId(e.target.value)}><option value="">Unassigned</option>{members.map(m=><option value={m.id} key={m.id}>{m.name} · {m.project_role}</option>)}</select>
    <label>Due date</label><input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/>
    <label>Description</label><textarea value={description} onChange={e=>setDescription(e.target.value)} rows="3" placeholder="Optional details"/>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!projects.length}>Create task</button></div>
    {!projects.length&&<p className="field-help">Create or join a project before adding tasks.</p>}
  </form></Modal>;
}


function UserForm({onClose,onSubmit}) {
  const [name,setName]=useState(''); const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [role,setRole]=useState('member');
  return <Modal title="Create a user" onClose={onClose}><form onSubmit={e=>{e.preventDefault();onSubmit({name,email,password,role})}} className="form-grid">
    <label>Full name</label><input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Jamie Davis" required maxLength={100}/>
    <label>Email address</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="jamie@example.com" required/>
    <label>Temporary password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} required/>
    <label>Global role</label><select value={role} onChange={e=>setRole(e.target.value)}><option value="admin">Admin</option><option value="manager">Project Manager</option><option value="member">Team Member</option><option value="viewer">Viewer</option></select>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Create user</button></div>
  </form></Modal>;
}

function ManageMembersModal({project,team,onClose,onChanged,notify}) {
  const [members,setMembers]=useState([]); const [userId,setUserId]=useState(''); const [role,setRole]=useState('member'); const [loading,setLoading]=useState(true);
  const refresh=useCallback(async()=>{setLoading(true);try{setMembers(await api(`/api/projects/${project.id}/members`));}catch(e){notify(e.message)}finally{setLoading(false)}},[project.id]);
  useEffect(()=>{refresh()},[refresh]);
  const available=team.filter(u=>u.active!==false&&!members.some(m=>m.id===u.id));
  async function addMember(e){e.preventDefault();try{await api(`/api/projects/${project.id}/members`,{method:'POST',body:JSON.stringify({userId:Number(userId),role})});setUserId('');await refresh();await onChanged();notify('Member added to project.')}catch(e){notify(e.message)}}
  async function setMemberRole(memberId,newRole){try{await api(`/api/projects/${project.id}/members`,{method:'POST',body:JSON.stringify({userId:memberId,role:newRole})});await refresh();notify('Project role updated.')}catch(e){notify(e.message)}}
  async function removeMember(member){if(!window.confirm(`Remove ${member.name} from ${project.name}?`))return;try{await api(`/api/projects/${project.id}/members/${member.id}`,{method:'DELETE'});await refresh();await onChanged();notify('Member removed.')}catch(e){notify(e.message)}}
  return <Modal title={`Manage members · ${project.name}`} onClose={onClose}>
    <div className="member-manage-list">{loading?<p className="field-help">Loading project members…</p>:members.map(m=><div className="member-manage-row" key={m.id}><div className="comment-avatar">{m.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div><div className="member-manage-info"><b>{m.name}</b><small>{m.email}</small></div><select value={m.project_role} onChange={e=>setMemberRole(m.id,e.target.value)} aria-label={`Project role for ${m.name}`}><option value="manager">Manager</option><option value="member">Member</option><option value="viewer">Viewer</option></select><button className="remove-member" onClick={()=>removeMember(m)} title="Remove member"><X size={15}/></button></div>)}{!loading&&!members.length&&<div className="comment-empty">No members assigned yet.</div>}</div>
    <form className="add-member-form" onSubmit={addMember}><label>Add a teammate</label><div className="add-member-controls"><select value={userId} onChange={e=>setUserId(e.target.value)} required><option value="">Choose a user…</option>{available.map(m=><option value={m.id} key={m.id}>{m.name} · {roleLabels[m.role]||m.role}</option>)}</select><select value={role} onChange={e=>setRole(e.target.value)}><option value="manager">Manager</option><option value="member">Member</option><option value="viewer">Viewer</option></select><button className="button primary" disabled={!userId}><Plus size={14}/> Add</button></div>{!available.length&&<p className="field-help">Everyone you can add is already on this project. Admins can create new users from the Team page.</p>}</form>
  </Modal>;
}

function TaskDetails({task,user,onClose,onCycle,onDelete,onRefresh,notify}) {
  const [comments,setComments]=useState([]); const [body,setBody]=useState(''); const [error,setError]=useState('');
  const loadComments=useCallback(async()=>{try{setComments(await api(`/api/tasks/${task.id}/comments`));setError('')}catch(e){setError(e.message)}},[task.id]);
  useEffect(()=>{loadComments()},[loadComments]);
  const readOnly=user.role==='viewer';
  async function addComment(e){e.preventDefault();try{await api(`/api/tasks/${task.id}/comments`,{method:'POST',body:JSON.stringify({body})});setBody('');await loadComments();notify('Comment added.')}catch(e){notify(e.message)}}
  return <Modal title="Task details" onClose={onClose} wide>
    <div className="task-detail">
      <div className="task-detail-main"><div className="detail-label">TASK TITLE</div><h3>{task.title}</h3><p>{task.description||'No description provided.'}</p>
        <div className="detail-meta"><div><small>PROJECT</small><b>{task.project}</b></div><div><small>ASSIGNED TO</small><b>{task.assignee||'Unassigned'}</b></div><div><small>DUE DATE</small><b>{task.due_date||'Not set'}</b></div></div>
        <div className="detail-action-row"><span className={`pill ${task.status.toLowerCase().replace(' ','-')}`}>{task.status}</span>{user.role!=='viewer'&&<button className="button secondary" onClick={()=>onCycle(task)}><RefreshCw size={14}/> Change status</button>}{['admin','manager'].includes(user.role)&&<button className="button danger" onClick={()=>onDelete(task)}><Trash2 size={14}/> Delete</button>}</div>
      </div>
      <div className="comments-panel"><h3><MessageSquare size={17}/> Comments <span>{comments.length}</span></h3>
        {error&&<p className="inline-error">{error}</p>}
        <div className="comment-list">{comments.map(c=><div className="comment" key={c.id}><div className="comment-avatar">{c.author.split(' ').map(x=>x[0]).join('').slice(0,2)}</div><div className="comment-body"><div className="comment-meta"><b>{c.author}</b><small>{new Date(c.created_at+'Z').toLocaleString()}</small></div><p>{c.body}</p></div></div>)}{!comments.length&&!error&&<div className="comment-empty">No comments yet. Start the conversation.</div>}</div>
        {!readOnly&&<form className="comment-form" onSubmit={addComment}><input value={body} onChange={e=>setBody(e.target.value)} placeholder="Write a comment…" required maxLength={1000}/><button className="button primary" disabled={!body.trim()}><Send size={14}/></button></form>}
        {readOnly&&<p className="field-help">Viewers have read-only access.</p>}
      </div>
    </div>
  </Modal>;
}


function UserProfile({user,tasks,projects,onClose,isSelf}) {
  const assigned = tasks.filter(task => Number(task.assignee_id) === Number(user.id));
  const done = assigned.filter(task => task.status === 'Done').length;
  const taskProjectNames = [...new Set(assigned.map(task => task.project).filter(Boolean))];
  return <Modal title={isSelf ? 'My profile' : 'User profile'} onClose={onClose}>
    <div className="user-profile-view">
      <div className="user-profile-hero"><Avatar user={user}/><div><h3>{user.name}</h3><span className={`role-pill role-${user.role}`}>{roleLabels[user.role]||user.role}</span></div></div>
      <div className="profile-detail-list">
        <div className="profile-detail-row"><Mail size={17}/><div><small>Email address</small><b>{user.email||'Not available'}</b></div></div>
        <div className="profile-detail-row"><ShieldCheck size={17}/><div><small>Account status</small><b>{user.active===false?'Inactive':'Active'}</b></div></div>
        <div className="profile-detail-row"><CircleUserRound size={17}/><div><small>Global role</small><b>{roleLabels[user.role]||user.role}</b></div></div>
        {user.created_at&&<div className="profile-detail-row"><CalendarDays size={17}/><div><small>Joined</small><b>{new Date(user.created_at+'Z').toLocaleDateString()}</b></div></div>}
      </div>
      <div className="profile-task-summary"><div><span>Assigned tasks</span><strong>{assigned.length}</strong></div><div><span>Completed</span><strong>{done}</strong></div></div>
      <div className="profile-assigned-work"><h4>Assigned work</h4>{assigned.length ? <div className="profile-task-list">{assigned.slice(0,6).map(task=><div className="profile-task-row" key={task.id}><div><b>{task.title}</b><small>{task.project||'Project'}</small></div><span className={`pill ${task.status.toLowerCase().replace(' ','-')}`}>{task.status}</span></div>)}</div> : <p className="field-help">No assigned tasks are visible for this user in the current workspace.</p>}</div>
      {taskProjectNames.length>0&&<div className="profile-projects"><small>Projects represented in assigned tasks</small><p>{taskProjectNames.join(' · ')}</p></div>}
      <div className="modal-actions"><button className="button primary" onClick={onClose}>Done</button></div>
    </div>
  </Modal>;
}

function EditUserName({user,onClose,onSave}) {
  const [name,setName]=useState(user.name||'');
  return <Modal title="Edit person's name" onClose={onClose}><form className="form-grid" onSubmit={e=>{e.preventDefault();onSave(user.id,name.trim())}}>
    <div className="person-being-edited"><Avatar user={user}/><div><b>{user.email}</b><small>{roleLabels[user.role]||user.role}</small></div></div>
    <label>Full name</label>
    <input autoFocus value={name} onChange={e=>setName(e.target.value)} required maxLength={100} placeholder="Enter full name"/>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!name.trim()||name.trim()===user.name}>Save name</button></div>
  </form></Modal>;
}

function Modal({title,children,onClose,wide=false}) {
  useEffect(()=>{const handle=e=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle)},[onClose]);
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className={`modal ${wide?'modal-wide':''}`}><div className="modal-head"><h2>{title}</h2><button onClick={onClose} aria-label="Close"><X size={20}/></button></div>{children}</div></div>;
}
createRoot(document.getElementById('root')).render(<App/>);
