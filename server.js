const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from the root directory

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        // Allow only Excel files
        if (file.mimetype === 'application/vnd.ms-excel' || 
            file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.originalname.endsWith('.xls') || 
            file.originalname.endsWith('.xlsx')) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only Excel files (.xls, .xlsx) are allowed.'));
        }
    }
});

// In-memory storage for participants (in production, use a proper database)
let participants = [];

// Load existing data from file if it exists
const DATA_FILE = './participants-data.json';

async function loadDataFromFile() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        participants = JSON.parse(data);
        console.log('Loaded existing data from file');
    } catch (err) {
        // If file doesn't exist, that's fine - we'll start with an empty array
        console.log('No existing data file found, starting fresh');
        participants = [];
    }
}

async function saveDataToFile() {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(participants, null, 2));
        console.log('Data saved to file');
    } catch (err) {
        console.error('Error saving data to file:', err);
    }
}

// Initialize data
loadDataFromFile();

// Endpoint to upload Excel file
app.post('/api/upload', upload.single('excelFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        // Read the uploaded Excel file
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = xlsx.utils.sheet_to_json(worksheet);

        // Validate required columns
        const requiredColumns = ['P.No', 'Mobile No', 'Name', 'Trade', 'Gender', 'Attendance Day 1', 'Attendance Day 2'];
        const firstRow = jsonData[0] || {};
        const missingColumns = requiredColumns.filter(col => !firstRow.hasOwnProperty(col));

        if (missingColumns.length > 0) {
            return res.status(400).json({ 
                error: `Missing required columns: ${missingColumns.join(', ')}`,
                missingColumns
            });
        }

        // Validate data
        const validationErrors = [];
        const seenPNo = new Set();
        const seenMobileNo = new Set();

        jsonData.forEach((row, index) => {
            // Check for required fields
            if (!row['P.No'] || !row['Mobile No'] || !row['Name']) {
                validationErrors.push(`Row ${index + 2}: Missing required fields (P.No, Mobile No, or Name)`);
            }

            // Check for duplicates in the uploaded data
            if (seenPNo.has(row['P.No'])) {
                validationErrors.push(`Row ${index + 2}: Duplicate P.No '${row['P.No']}'`);
            }
            if (seenMobileNo.has(row['Mobile No'])) {
                validationErrors.push(`Row ${index + 2}: Duplicate Mobile No '${row['Mobile No']}'`);
            }

            // Add to sets for duplicate checking
            if (row['P.No']) seenPNo.add(row['P.No']);
            if (row['Mobile No']) seenMobileNo.add(row['Mobile No']);

            // Validate attendance values
            const day1 = String(row['Attendance Day 1']).toUpperCase().trim();
            const day2 = String(row['Attendance Day 2']).toUpperCase().trim();
            
            if (!['P', 'A'].includes(day1)) {
                validationErrors.push(`Row ${index + 2}: Invalid value for Attendance Day 1 (expected P or A, got ${row['Attendance Day 1']})`);
            }
            
            if (!['P', 'A'].includes(day2)) {
                validationErrors.push(`Row ${index + 2}: Invalid value for Attendance Day 2 (expected P or A, got ${row['Attendance Day 2']})`);
            }
        });

        if (validationErrors.length > 0) {
            return res.status(400).json({ 
                error: 'Validation failed',
                validationErrors
            });
        }

        // Check for duplicates against existing data
        const duplicateCheck = new Map();
        participants.forEach(p => {
            duplicateCheck.set(p.p_no, p);
            duplicateCheck.set(p.mobile_no, p);
        });

        let insertCount = 0;
        const newParticipants = [];

        jsonData.forEach(row => {
            // Check for duplicates against existing data
            if (duplicateCheck.has(row['P.No']) || duplicateCheck.has(row['Mobile No'])) {
                console.warn(`Skipping duplicate entry: ${row['P.No']} - ${row['Name']}`);
                return;
            }

            const newParticipant = {
                p_no: String(row['P.No']),
                mobile_no: String(row['Mobile No']),
                name: String(row['Name']),
                trade: String(row['Trade'] || ''),
                gender: String(row['Gender'] || ''),
                attendance_day1: String(row['Attendance Day 1']).toUpperCase(),
                attendance_day2: String(row['Attendance Day 2']).toUpperCase(),
                created_at: new Date().toISOString()
            };

            newParticipants.push(newParticipant);
            duplicateCheck.set(newParticipant.p_no, newParticipant);
            duplicateCheck.set(newParticipant.mobile_no, newParticipant);
            insertCount++;
        });

        // Add new participants to the main array
        participants.push(...newParticipants);

        // Save to file
        saveDataToFile();

        res.json({
            message: `Successfully processed ${jsonData.length} records`,
            insertedRecords: insertCount,
            duplicatesSkipped: jsonData.length - insertCount
        });

    } catch (error) {
        console.error('Error processing Excel file:', error);
        res.status(500).json({ error: 'Error processing Excel file', details: error.message });
    }
});

// Endpoint to search participants
app.get('/api/participants', (req, res) => {
    const { p_no, mobile_no, name, trade, gender, page = 1, limit = 10 } = req.query;

    // Filter participants based on query parameters
    let filteredParticipants = participants;

    if (p_no) {
        filteredParticipants = filteredParticipants.filter(p => 
            p.p_no.toLowerCase().includes(p_no.toLowerCase()));
    }
    if (mobile_no) {
        filteredParticipants = filteredParticipants.filter(p => 
            p.mobile_no.includes(mobile_no));
    }
    if (name) {
        filteredParticipants = filteredParticipants.filter(p => 
            p.name.toLowerCase().includes(name.toLowerCase()));
    }
    if (trade) {
        filteredParticipants = filteredParticipants.filter(p => p.trade === trade);
    }
    if (gender) {
        filteredParticipants = filteredParticipants.filter(p => p.gender === gender);
    }

    // Calculate pagination
    const total = filteredParticipants.length;
    const totalPages = Math.ceil(total / parseInt(limit));
    const currentPage = parseInt(page);
    
    const startIndex = (currentPage - 1) * parseInt(limit);
    const endIndex = Math.min(startIndex + parseInt(limit), total);
    const paginatedResults = filteredParticipants.slice(startIndex, endIndex);

    res.json({
        participants: paginatedResults,
        pagination: {
            total,
            page: currentPage,
            totalPages,
            limit: parseInt(limit),
            hasNext: currentPage < totalPages,
            hasPrev: currentPage > 1
        }
    });
});

// Endpoint to get a specific participant by P.No
app.get('/api/participants/:p_no', (req, res) => {
    const p_no = req.params.p_no;
    
    const participant = participants.find(p => p.p_no === p_no);

    if (!participant) {
        return res.status(404).json({ error: 'Participant not found' });
    }

    res.json(participant);
});

// Endpoint to get all unique trades for filter dropdown
app.get('/api/trades', (req, res) => {
    const trades = [...new Set(participants.map(p => p.trade).filter(t => t))];
    res.json(trades);
});

// Endpoint to get all unique genders for filter dropdown
app.get('/api/genders', (req, res) => {
    const genders = [...new Set(participants.map(p => p.gender).filter(g => g))];
    res.json(genders);
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Access the application at http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    await saveDataToFile();
    process.exit(0);
});