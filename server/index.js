const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Enable CORS for React frontend
app.use(express.json()); // Parse JSON request bodies

// Routes
const openaiRoutes = require('./routes/openai');
const spotifyRoutes = require('./routes/spotify');

app.use('/api', openaiRoutes);
app.use('/api', spotifyRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

