/**
 * Companion Robot Cloud Management System - Local Backend
 * * SETUP INSTRUCTIONS:
 * 1. Install Node.js from nodejs.org
 * 2. Open terminal in your project folder and run: npm init -y
 * 3. Install required packages: npm install express sqlite3 cors
 * 4. Put all your HTML/CSS files in a folder named 'public' in the same directory.
 * 5. Run the server: node server.js
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware to parse JSON bodies and allow cross-origin requests
app.use(express.json());
app.use(cors());

// Serve static files (your HTML, CSS, JS) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite Database (creates 'robot_system.db' file locally)
const db = new sqlite3.Database('./robot_system.db', (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initializeDatabase();
    }
});

// Create tables based on the GP3.pdf Class Diagram
function initializeDatabase() {
    db.serialize(() => {
        // 1. User Table
        db.run(`CREATE TABLE IF NOT EXISTS User (
            UserID INTEGER PRIMARY KEY AUTOINCREMENT,
            Role TEXT NOT NULL,
            FirstName TEXT NOT NULL,
            LastName TEXT NOT NULL,
            DOB DATE,
            Phone TEXT,
            Email TEXT UNIQUE NOT NULL,
            Username TEXT UNIQUE NOT NULL,
            Password TEXT NOT NULL,
            SubscriptionStatus BOOLEAN DEFAULT 1,
            SubscriptionExpiry DATE
        )`);

        // 2. Admin Table
        db.run(`CREATE TABLE IF NOT EXISTS Admin (
            AdminID INTEGER PRIMARY KEY AUTOINCREMENT,
            Name TEXT NOT NULL,
            Email TEXT UNIQUE NOT NULL,
            Role TEXT NOT NULL
        )`);

        // 3. Emergency Contact Table
        db.run(`CREATE TABLE IF NOT EXISTS EmergencyContact (
            ContactID INTEGER PRIMARY KEY AUTOINCREMENT,
            Name TEXT NOT NULL,
            PhoneNumber TEXT NOT NULL,
            Email TEXT,
            Relationship TEXT,
            UserID INTEGER,
            FOREIGN KEY(UserID) REFERENCES User(UserID)
        )`);

        // 4. Robot Table
        db.run(`CREATE TABLE IF NOT EXISTS Robot (
            RobotID TEXT PRIMARY KEY,
            Model TEXT,
            SerialNumber TEXT UNIQUE,
            CurrentVersion TEXT,
            OwnerID INTEGER,
            FOREIGN KEY(OwnerID) REFERENCES User(UserID)
        )`);

        // Insert a default admin account for demonstration purposes
        db.run(`INSERT OR IGNORE INTO Admin (AdminID, Name, Email, Role) 
                VALUES (1, 'Admin User', 'admin@robotcare.com', 'SuperAdmin')`);
        
        console.log('Database tables verified/created successfully.');
    });
}

// ==========================================
// API ENDPOINTS (Routes your frontend will call)
// ==========================================

// --- SIGN UP (Create new User) ---
app.post('/api/signup', (req, res) => {
  // 1. Extract the nested fields correctly
  const { role } = req.body;
  const { firstName, lastName, dob, phone, email } = req.body.personal;
  const { username, password } = req.body.account;
  const emergency = req.body.emergencyContact;

  // 2. Make sure you are passing the extracted 'email' variable into your query
  const query = `
    INSERT INTO User (Role, FirstName, LastName, DOB, Phone, Email, Username, Password) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const values = [role, firstName, lastName, dob, phone, email, username, password];

  db.run(query, values, function(err) {
    if (err) {
      console.error(err);
      // If it's a constraint error like UNIQUE username/email, handle it here
      return res.status(400).json({ error: "Failed to create user. Username or email might already exist." });
    }
    
    const newUserId = this.lastID;

    // If emergency contact details were provided, insert them linked to the new user
    if (emergency && emergency.name) {
      const contactQuery = `INSERT INTO EmergencyContact (Name, PhoneNumber, Email, Relationship, UserID) VALUES (?, ?, ?, ?, ?)`;
      db.run(contactQuery, [emergency.name, emergency.phone, emergency.email, emergency.relationship, newUserId], function(err) {
        if (err) console.error("Failed to add emergency contact:", err.message);
        res.status(200).json({ message: "Account and emergency contact created successfully" });
      });
    } else {
      res.status(200).json({ message: "Account created successfully" });
    }
  });
});

// --- LOGIN ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    // Check if it's the admin
    if (username === 'admin' && password === 'admin123') {
        return res.json({ role: 'admin', message: 'Admin login successful' });
    }

    // Check regular users
    const query = `SELECT UserID, FirstName, LastName, Username, Email FROM User WHERE Username = ? AND Password = ?`;
    db.get(query, [username, password], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (row) {
            res.json({ role: 'user', user: row, message: 'Login successful' });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    });
});

// --- ADMIN: GET ALL USERS ---
app.get('/api/admin/users', (req, res) => {
    const query = `SELECT * FROM User`;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- ADMIN: UPDATE USER ---
app.put('/api/admin/users/:id', (req, res) => {
    const userId = req.params.id;
    const { Role, FirstName, LastName, DOB, Phone, Email, Username, Password, SubscriptionStatus } = req.body;

    const query = `
        UPDATE User 
        SET Role = ?, FirstName = ?, LastName = ?, DOB = ?, Phone = ?, Email = ?, Username = ?, Password = ?, SubscriptionStatus = ? 
        WHERE UserID = ?
    `;
    const values = [Role, FirstName, LastName, DOB, Phone, Email, Username, Password, SubscriptionStatus, userId];

    db.run(query, values, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'User updated successfully' });
    });
});

// --- GET EMERGENCY CONTACTS FOR USER ---
app.get('/api/contacts', (req, res) => {
    const { userId } = req.query;
    const query = `SELECT * FROM EmergencyContact WHERE UserID = ?`;
    db.all(query, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- ADD EMERGENCY CONTACT ---
app.post('/api/contacts', (req, res) => {
    const { name, phone, email, relationship, userId } = req.body;
    const query = `INSERT INTO EmergencyContact (Name, PhoneNumber, Email, Relationship, UserID) VALUES (?, ?, ?, ?, ?)`;
    
    db.run(query, [name, phone, email, relationship, userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Contact added', contactId: this.lastID });
    });
});

// --- UPDATE EMERGENCY CONTACT ---
app.put('/api/contacts/:id', (req, res) => {
    const contactId = req.params.id;
    const { name, phone, email, relationship } = req.body;
    const query = `UPDATE EmergencyContact SET Name = ?, PhoneNumber = ?, Email = ?, Relationship = ? WHERE ContactID = ?`;
    db.run(query, [name, phone, email, relationship, contactId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Contact updated' });
    });
});

// --- DELETE EMERGENCY CONTACT ---
app.delete('/api/contacts/:id', (req, res) => {
    const contactId = req.params.id;
    const query = `DELETE FROM EmergencyContact WHERE ContactID = ?`;
    db.run(query, [contactId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Contact deleted' });
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`> RobotCare Backend Running Locally`);
    console.log(`> API is listening on http://localhost:${PORT}`);
    console.log(`> Open http://localhost:${PORT}/index.html in your browser`);
    console.log(`=========================================`);
});