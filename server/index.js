import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3001);
const JWT_SECRET = process.env.JWT_SECRET || 'project-web-local-development-secret-change-me';
const dbFile = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'project-web.db');
fs.mkdirSync(path.dirname(path.resolve(dbFile)), { recursive: true });
const db = new Database(dbFile);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');
db.exec(fs.readFileSync(path.join(__dirname, 'migrations', '001_init.sql'), 'utf8'));

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, active: Boolean(u.active)
});
const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
const getProject = (id) => db.prepare('SELECT * FROM projects WHERE id = ? AND archived = 0').get(id);
const getTask = (id) => db.prepare(`
  SELECT t.*, p.name AS project_name, p.archived
  FROM tasks t JOIN projects p ON p.id = t.project_id
  WHERE t.id = ?
`).get(id);

function seedDatabase() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (count === 0) {
    const users = [
      ['Alex Morgan', 'admin@projectweb.local', 'admin', 'password123'],
      ['Jamie Davis', 'manager@projectweb.local', 'manager', 'password123'],
      ['Sam Kim', 'member@projectweb.local', 'member', 'password123'],
      ['Riley Lee', 'viewer@projectweb.local', 'viewer', 'password123']
    ];
    const insertUser = db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)');
    const tx = db.transaction(() => users.forEach(([name,email,role,password]) => {
      insertUser.run(name,email,bcrypt.hashSync(password, 10),role);
    }));
    tx();
  }
  const projectCount = db.prepare('SELECT COUNT(*) AS count FROM projects').get().count;
  if (projectCount === 0) {
    const admin = db.prepare("SELECT id FROM users WHERE role='admin'").get().id;
    const manager = db.prepare("SELECT id FROM users WHERE role='manager'").get().id;
    const member = db.prepare("SELECT id FROM users WHERE role='member'").get().id;
    const viewer = db.prepare("SELECT id FROM users WHERE role='viewer'").get().id;
    const insertProject = db.prepare('INSERT INTO projects (name,description,status,created_by) VALUES (?,?,?,?)');
    const p1 = insertProject.run('Website Redesign','Refresh the company website and improve the user experience.','In progress',admin).lastInsertRowid;
    const p2 = insertProject.run('Mobile App','Build the first version of our mobile application.','In progress',admin).lastInsertRowid;
    const p3 = insertProject.run('Marketing Campaign','Prepare launch content and campaign assets.','Planning',admin).lastInsertRowid;
    const addMember = db.prepare('INSERT OR IGNORE INTO project_members (project_id,user_id,role) VALUES (?,?,?)');
    [[p1,manager,'manager'],[p1,member,'member'],[p1,viewer,'viewer'],[p2,manager,'manager'],[p2,member,'member'],[p3,manager,'manager'],[p3,viewer,'viewer']].forEach(x=>addMember.run(...x));
    const addTask = db.prepare('INSERT INTO tasks (project_id,title,description,status,assignee_id,due_date,created_by) VALUES (?,?,?,?,?,?,?)');
    addTask.run(p1,'Create homepage wireframes','Draft the main landing page and responsive layouts.','In progress',member,'2026-10-24',manager);
    addTask.run(p2,'Review mobile navigation','Check the navigation flow on smaller screens.','To do',manager,'2026-10-25',manager);
    addTask.run(p3,'Prepare launch checklist','Collect the final launch tasks and owners.','Done',viewer,'2026-10-28',manager);
    addTask.run(p1,'Update design system','Refresh reusable components and typography.','To do',member,'2026-10-29',manager);
  }
}
seedDatabase();

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ message: 'Please sign in to continue.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = getUser(payload.id);
    if (!user || !user.active) return res.status(401).json({ message: 'This account is inactive. Contact an admin.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Your session expired. Please sign in again.' });
  }
}
const adminOnly = (req,res,next) => req.user.role === 'admin'
  ? next() : res.status(403).json({ message: 'Only an Admin can do that.' });

function membership(projectId, userId) {
  return db.prepare('SELECT * FROM project_members WHERE project_id=? AND user_id=?').get(projectId,userId);
}
function canAccessProject(user, projectId) {
  if (user.role === 'admin') return Boolean(getProject(projectId));
  return Boolean(getProject(projectId) && membership(projectId,user.id));
}
function canManageProject(user, projectId) {
  if (user.role === 'admin') return Boolean(getProject(projectId));
  const m = membership(projectId,user.id);
  return Boolean(getProject(projectId) && m && (user.role === 'manager' || m.role === 'manager'));
}
function requireProjectAccess(req,res,next) {
  if (!canAccessProject(req.user, Number(req.params.id))) return res.status(403).json({message:'You do not have access to this project.'});
  next();
}
function requireTaskAccess(req,res,next) {
  const task = getTask(Number(req.params.id));
  if (!task || task.archived) return res.status(404).json({message:'Task not found.'});
  if (!canAccessProject(req.user, task.project_id)) return res.status(403).json({message:'You do not have access to this task.'});
  if (req.user.role === 'member' && task.assignee_id !== req.user.id) return res.status(403).json({message:'Team Members can only open tasks assigned to them.'});
  req.task = task;
  next();
}
function taskRow(task) {
  return {
    id: task.id, project_id: task.project_id, project: task.project_name, title: task.title,
    description: task.description, status: task.status, assignee_id: task.assignee_id,
    assignee: task.assignee_name || null, assignee_email: task.assignee_email || null,
    due_date: task.due_date, version: task.version, updated_at: task.updated_at
  };
}
function listTasksForUser(user, projectId = null) {
  let sql = `SELECT t.*, p.name AS project_name, u.name AS assignee_name, u.email AS assignee_email
             FROM tasks t JOIN projects p ON p.id=t.project_id
             LEFT JOIN users u ON u.id=t.assignee_id
             WHERE p.archived=0`;
  const args = [];
  if (projectId !== null) { sql += ' AND t.project_id=?'; args.push(projectId); }
  if (user.role !== 'admin') {
    sql += ` AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id=t.project_id AND pm.user_id=?)`;
    args.push(user.id);
    if (user.role === 'member') { sql += ' AND t.assignee_id=?'; args.push(user.id); }
  }
  sql += ' ORDER BY t.id DESC';
  return db.prepare(sql).all(...args).map(taskRow);
}

app.get('/api/health', (_req,res) => res.json({ok:true, name:'Project Web'}));
app.post('/api/auth/login', (req,res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user || !user.active || !bcrypt.compareSync(password,user.password_hash)) {
    return res.status(401).json({message:'Email or password is incorrect.'});
  }
  const token = jwt.sign({id:user.id}, JWT_SECRET, {expiresIn:'12h'});
  res.json({token,user:publicUser(user)});
});
app.get('/api/auth/me', auth, (req,res) => res.json({user:publicUser(req.user)}));

app.get('/api/projects', auth, (req,res) => {
  let rows;
  if (req.user.role === 'admin') {
    rows = db.prepare('SELECT * FROM projects WHERE archived=0 ORDER BY id DESC').all();
  } else {
    rows = db.prepare(`SELECT p.* FROM projects p JOIN project_members pm ON pm.project_id=p.id
                       WHERE pm.user_id=? AND p.archived=0 ORDER BY p.id DESC`).all(req.user.id);
  }
  const getStats = db.prepare(`SELECT COUNT(*) AS tasks, SUM(CASE WHEN status='Done' THEN 1 ELSE 0 END) AS done
                               FROM tasks WHERE project_id=?`);
  res.json(rows.map(p => ({...p, ...getStats.get(p.id), tasks: getStats.get(p.id).tasks || 0, done: getStats.get(p.id).done || 0})));
});
app.post('/api/projects', auth, adminOnly, (req,res) => {
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim();
  if (!name) return res.status(400).json({message:'Project name is required.'});
  const info = db.prepare('INSERT INTO projects (name,description,status,created_by) VALUES (?,?,?,?)')
    .run(name,description,'Planning',req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM projects WHERE id=?').get(info.lastInsertRowid));
});
app.get('/api/projects/:id', auth, requireProjectAccess, (req,res) => {
  res.json(db.prepare('SELECT * FROM projects WHERE id=?').get(Number(req.params.id)));
});
app.patch('/api/projects/:id', auth, requireProjectAccess, (req,res) => {
  const projectId = Number(req.params.id);
  if (!canManageProject(req.user,projectId)) return res.status(403).json({message:'Only an Admin or assigned Project Manager can edit this project.'});
  const name = req.body.name === undefined ? null : String(req.body.name).trim();
  const description = req.body.description === undefined ? null : String(req.body.description).trim();
  const current = getProject(projectId);
  const nextName = name === null ? current.name : name;
  const nextDescription = description === null ? current.description : description;
  if (!nextName) return res.status(400).json({message:'Project name is required.'});
  db.prepare('UPDATE projects SET name=?,description=? WHERE id=?').run(nextName,nextDescription,projectId);
  res.json(getProject(projectId));
});
app.patch('/api/projects/:id/archive', auth, adminOnly, (req,res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE projects SET archived=1 WHERE id=?').run(id);
  res.json({ok:true});
});

app.get('/api/projects/:id/members', auth, requireProjectAccess, (req,res) => {
  res.json(db.prepare(`SELECT u.id,u.name,u.email,u.role AS global_role,pm.role AS project_role
    FROM project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=? ORDER BY u.name`).all(Number(req.params.id)));
});
app.post('/api/projects/:id/members', auth, requireProjectAccess, (req,res) => {
  const projectId = Number(req.params.id);
  if (!canManageProject(req.user,projectId)) return res.status(403).json({message:'Only an Admin or Project Manager can manage project members.'});
  const userId = Number(req.body.userId);
  const role = ['manager','member','viewer'].includes(req.body.role) ? req.body.role : 'member';
  if (!getUser(userId) || !getProject(projectId)) return res.status(404).json({message:'User or project not found.'});
  db.prepare('INSERT INTO project_members (project_id,user_id,role) VALUES (?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET role=excluded.role')
    .run(projectId,userId,role);
  res.status(201).json({ok:true});
});
app.delete('/api/projects/:id/members/:userId', auth, requireProjectAccess, (req,res) => {
  const projectId = Number(req.params.id);
  if (!canManageProject(req.user,projectId)) return res.status(403).json({message:'Only an Admin or Project Manager can manage project members.'});
  db.prepare('DELETE FROM project_members WHERE project_id=? AND user_id=?').run(projectId,Number(req.params.userId));
  res.json({ok:true});
});

app.get('/api/tasks', auth, (req,res) => {
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  if (projectId !== null && !canAccessProject(req.user,projectId)) return res.status(403).json({message:'You do not have access to this project.'});
  res.json(listTasksForUser(req.user,projectId));
});
app.post('/api/tasks', auth, (req,res) => {
  const projectId = Number(req.body.project_id);
  const project = getProject(projectId);
  if (!project) return res.status(404).json({message:'Project not found.'});
  if (!canManageProject(req.user,projectId)) return res.status(403).json({message:'Only an Admin or assigned Project Manager can create tasks.'});
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  const dueDate = req.body.due_date ? String(req.body.due_date) : null;
  const assigneeId = req.body.assignee_id ? Number(req.body.assignee_id) : null;
  if (!title) return res.status(400).json({message:'Task title is required.'});
  if (assigneeId && !membership(projectId,assigneeId)) return res.status(400).json({message:'The assignee must be a member of this project.'});
  const info = db.prepare(`INSERT INTO tasks (project_id,title,description,status,assignee_id,due_date,created_by)
    VALUES (?,?,?,?,?,?,?)`).run(projectId,title,description,'To do',assigneeId,dueDate,req.user.id);
  res.status(201).json(listTasksForUser(req.user,projectId).find(t=>t.id===Number(info.lastInsertRowid)) || getTask(info.lastInsertRowid));
});
app.get('/api/tasks/:id', auth, requireTaskAccess, (req,res) => {
  const t = db.prepare(`SELECT t.*,p.name AS project_name,u.name AS assignee_name,u.email AS assignee_email
    FROM tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN users u ON u.id=t.assignee_id WHERE t.id=?`).get(req.task.id);
  res.json(taskRow(t));
});
app.put('/api/tasks/:id', auth, requireTaskAccess, (req,res) => {
  const t = req.task;
  const body = req.body || {};
  if (!Number.isInteger(Number(body.version))) return res.status(400).json({message:'Task version is required when updating a task.'});
  if (Number(body.version) !== t.version) {
    const latest = db.prepare(`SELECT t.*,p.name AS project_name,u.name AS assignee_name,u.email AS assignee_email
      FROM tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN users u ON u.id=t.assignee_id WHERE t.id=?`).get(t.id);
    return res.status(409).json({message:'This task was changed by someone else. Review the latest version before saving.',current:taskRow(latest)});
  }
  const manager = canManageProject(req.user,t.project_id);
  if (req.user.role === 'viewer') return res.status(403).json({message:'Viewers have read-only access.'});
  if (req.user.role === 'member' && t.assignee_id !== req.user.id) return res.status(403).json({message:'You can only update tasks assigned to you.'});
  const allowedStatus = ['To do','In progress','Done'];
  const title = manager && body.title !== undefined ? String(body.title).trim() : t.title;
  const description = manager && body.description !== undefined ? String(body.description).trim() : t.description;
  const status = body.status !== undefined ? String(body.status) : t.status;
  const assigneeId = manager && body.assignee_id !== undefined ? (body.assignee_id ? Number(body.assignee_id) : null) : t.assignee_id;
  const dueDate = manager && body.due_date !== undefined ? (body.due_date || null) : t.due_date;
  if (!title) return res.status(400).json({message:'Task title is required.'});
  if (!allowedStatus.includes(status)) return res.status(400).json({message:'Invalid task status.'});
  if (assigneeId && !membership(t.project_id,assigneeId)) return res.status(400).json({message:'The assignee must be a member of this project.'});
  // Compare-and-swap: even if two requests read the same version, only one can save it.
  const result = db.prepare(`UPDATE tasks SET title=?,description=?,status=?,assignee_id=?,due_date=?,version=version+1,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND version=?`).run(title,description,status,assigneeId,dueDate,t.id,Number(body.version));
  if (result.changes !== 1) {
    const latest = db.prepare(`SELECT t.*,p.name AS project_name,u.name AS assignee_name,u.email AS assignee_email
      FROM tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN users u ON u.id=t.assignee_id WHERE t.id=?`).get(t.id);
    return res.status(409).json({message:'This task was changed by someone else. Review the latest version before saving.',current:taskRow(latest)});
  }
  const updated = db.prepare(`SELECT t.*,p.name AS project_name,u.name AS assignee_name,u.email AS assignee_email
    FROM tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN users u ON u.id=t.assignee_id WHERE t.id=?`).get(t.id);
  res.json(taskRow(updated));
});
app.delete('/api/tasks/:id', auth, requireTaskAccess, (req,res) => {
  if (!canManageProject(req.user,req.task.project_id)) return res.status(403).json({message:'Only an Admin or Project Manager can delete tasks.'});
  db.prepare('DELETE FROM tasks WHERE id=?').run(req.task.id);
  res.json({ok:true});
});

app.get('/api/tasks/:id/comments', auth, requireTaskAccess, (req,res) => {
  const rows = db.prepare(`SELECT c.id,c.task_id,c.body,c.created_at,u.name AS author,u.id AS user_id
    FROM comments c JOIN users u ON u.id=c.user_id WHERE c.task_id=? ORDER BY c.id ASC`).all(req.task.id);
  res.json(rows);
});
app.post('/api/tasks/:id/comments', auth, requireTaskAccess, (req,res) => {
  if (req.user.role === 'viewer') return res.status(403).json({message:'Viewers have read-only access.'});
  const body = String(req.body.body || '').trim();
  if (!body) return res.status(400).json({message:'Comment cannot be empty.'});
  const info = db.prepare('INSERT INTO comments (task_id,user_id,body) VALUES (?,?,?)').run(req.task.id,req.user.id,body);
  res.status(201).json(db.prepare(`SELECT c.id,c.task_id,c.body,c.created_at,u.name AS author,u.id AS user_id
    FROM comments c JOIN users u ON u.id=c.user_id WHERE c.id=?`).get(info.lastInsertRowid));
});
app.delete('/api/comments/:id', auth, (req,res) => {
  const comment = db.prepare(`SELECT c.*,t.project_id,t.assignee_id FROM comments c JOIN tasks t ON t.id=c.task_id WHERE c.id=?`).get(Number(req.params.id));
  if (!comment) return res.status(404).json({message:'Comment not found.'});
  if (req.user.role === 'viewer') return res.status(403).json({message:'Viewers have read-only access.'});
  if (!canAccessProject(req.user,comment.project_id)) return res.status(403).json({message:'You do not have access to this comment.'});
  if (req.user.role === 'member' && comment.assignee_id !== req.user.id) return res.status(403).json({message:'Team Members can only manage comments on tasks assigned to them.'});
  const own = comment.user_id === req.user.id;
  const manager = canManageProject(req.user,comment.project_id);
  if (!own && !manager) return res.status(403).json({message:'You can only delete your own comments.'});
  db.prepare('DELETE FROM comments WHERE id=?').run(comment.id);
  res.json({ok:true});
});

app.get('/api/team', auth, (req,res) => {
  if (req.user.role === 'admin') {
    return res.json(db.prepare('SELECT id,name,email,role,active,created_at FROM users ORDER BY name').all().map(u=>({...u,active:Boolean(u.active)})));
  }
  res.json(db.prepare(`SELECT DISTINCT u.id,u.name,u.email,u.role,u.active
    FROM users u JOIN project_members pm ON pm.user_id=u.id
    WHERE pm.project_id IN (SELECT project_id FROM project_members WHERE user_id=?)
    ORDER BY u.name`).all(req.user.id).map(u=>({...u,active:Boolean(u.active)})));
});
app.post('/api/users', auth, adminOnly, (req,res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = String(req.body.role || 'member');
  if (!name || !email || password.length < 8 || !['admin','manager','member','viewer'].includes(role)) {
    return res.status(400).json({message:'Provide a name, valid email, password of at least 8 characters, and valid role.'});
  }
  try {
    const info = db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)')
      .run(name,email,bcrypt.hashSync(password,10),role);
    res.status(201).json(publicUser(getUser(info.lastInsertRowid)));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({message:'That email is already in use.'});
    throw e;
  }
});
app.patch('/api/users/:id', auth, adminOnly, (req,res) => {
  const id = Number(req.params.id);
  const user = getUser(id);
  if (!user) return res.status(404).json({message:'User not found.'});
  const name = req.body.name === undefined ? user.name : String(req.body.name).trim();
  const role = req.body.role === undefined ? user.role : String(req.body.role);
  const active = req.body.active === undefined ? user.active : (req.body.active ? 1 : 0);
  if (!name || !['admin','manager','member','viewer'].includes(role)) return res.status(400).json({message:'Invalid user details.'});
  if (id === req.user.id && !active) return res.status(400).json({message:'You cannot deactivate your own account.'});
  db.prepare('UPDATE users SET name=?,role=?,active=? WHERE id=?').run(name,role,active,id);
  res.json(publicUser(getUser(id)));
});

app.use((err,req,res,next) => {
  console.error(err);
  res.status(500).json({message:'Something went wrong on the server.'});
});
app.listen(PORT, () => {
  console.log(`Project Web API is running at http://localhost:${PORT}`);
  console.log('Demo accounts are listed in README.md');
});
