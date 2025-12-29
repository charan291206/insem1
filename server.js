const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

const app = express();
const PORT = 3000;

// Ensure upload directory exists
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration - saves files with student username prefix
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const studentName = req.session.user ? req.session.user.username : 'unknown';
    cb(null, studentName + '-' + file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Session configuration
app.use(session({
  secret: 'your_secret_key_change_in_production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Middleware
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ============================================
// HARDCODED USER CREDENTIALS (Replace with DB later)
// ============================================
const users = {
  admin: { 
    password: 'admin123', 
    role: 'ADMIN',
    name: 'Administrator'
  },
  student1: { 
    password: 'student123', 
    role: 'STUDENT',
    name: 'Student One'
  },
  student2: { 
    password: 'student@123', 
    role: 'STUDENT',
    name: 'Student Two'
  }
};

// ============================================
// IN-MEMORY PROJECT STORAGE (Replace with DB later)
// ============================================
let projects = [];

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================
const authMiddleware = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
};

// Admin-only middleware
const adminMiddleware = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'ADMIN') {
    return res.status(403).send('Access Denied: Admin privileges required');
  }
  next();
};

// ============================================
// ROUTES
// ============================================

// Default route - redirect to login
app.get('/', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  
  // Role-based redirection
  if (req.session.user.role === 'ADMIN') {
    return res.redirect('/admin-dashboard');
  } else {
    return res.redirect('/student-dashboard');
  }
});

// Login page (accessible to all)
app.get('/login', (req, res) => {
  // If already logged in, redirect based on role
  if (req.session.user) {
    if (req.session.user.role === 'ADMIN') {
      return res.redirect('/admin-dashboard');
    } else {
      return res.redirect('/student-dashboard');
    }
  }
  res.render('login', { error: null });
});

// Login POST handler
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users[username];

  // Validate credentials
  if (user && user.password === password) {
    // Store user session
    req.session.user = { 
      username, 
      role: user.role,
      name: user.name
    };
    
    // Redirect based on role
    if (user.role === 'ADMIN') {
      return res.redirect('/admin-dashboard');
    } else {
      return res.redirect('/student-dashboard');
    }
  }
  
  // Invalid credentials
  res.render('login', { error: 'Invalid username or password' });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/login');
  });
});

// ============================================
// ADMIN ROUTES (Protected)
// ============================================

// Admin Dashboard - View all projects
app.get('/admin-dashboard', authMiddleware, adminMiddleware, (req, res) => {
  res.render('adminDashboard', { 
    user: req.session.user,
    projects: projects, // All projects visible to admin
    students: Object.keys(users).filter(u => users[u].role === 'STUDENT')
  });
});

// ============================================
// STUDENT ROUTES (Protected)
// ============================================

// Student Dashboard - View only their projects
app.get('/student-dashboard', authMiddleware, (req, res) => {
  // Filter projects to show only current student's projects
  const studentProjects = projects.filter(p => p.studentUsername === req.session.user.username);
  
  res.render('index', { 
    user: req.session.user,
    projects: studentProjects
  });
});

// Add project page (students only)
app.get('/add-project', authMiddleware, (req, res) => {
  if (req.session.user.role !== 'STUDENT') {
    return res.status(403).send('Only students can add projects');
  }
  res.render('add-project', { user: req.session.user });
});

// Add project POST handler
app.post('/add-project', authMiddleware, upload.array('media', 5), (req, res) => {
  if (req.session.user.role !== 'STUDENT') {
    return res.status(403).send('Only students can add projects');
  }

  const { title, description, category, github, liveDemo, milestone } = req.body;
  const mediaFiles = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];

  const newProject = {
    id: Date.now(),
    title,
    description,
    category: category || 'General',
    github: github || '',
    liveDemo: liveDemo || '',
    milestone: milestone || 'In Progress',
    media: mediaFiles,
    studentUsername: req.session.user.username,
    studentName: req.session.user.name,
    createdAt: new Date().toISOString(),
    uploadDate: new Date().toLocaleDateString()
  };

  projects.push(newProject);
  res.redirect('/student-dashboard');
});

// API endpoint to get project details (for admin download/view)
app.get('/api/project/:id', authMiddleware, adminMiddleware, (req, res) => {
  const project = projects.find(p => p.id === parseInt(req.params.id));
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  res.json(project);
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Sample credentials:');
  console.log('Admin - username: admin, password: admin123');
  console.log('Student - username: student1, password: student123');
});