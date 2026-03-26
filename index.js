require('dotenv').config();
const express = require('express');
const cors = require('cors');

const demandesRoutes = require('./routes/demandes');
const comptesRendusRoutes = require('./routes/comptesRendus');
const rendezVousRoutes = require('./routes/rendezVous');
const rappelsRoutes = require('./routes/rappels');
const dashboardRoutes = require('./routes/dashboard');
const patientsRoutes = require('./routes/patients');
const consultationsRoutes = require('./routes/consultations');
const transcriptionRoutes = require('./routes/transcription');
const compteRenduRoutes = require('./routes/compteRendu');

const app = express();

const allowedOrigins = [
  'https://medecin-front-eight.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

app.use(cors({
  origin: function (origin, callback) {
    // Autorise les requêtes sans origin (Postman, curl, health checks, navigateur direct)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origine non autorisée par CORS : ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Santé du serveur
app.get('/', (req, res) => {
  res.json({
    message: 'Backend Assistant Médical IA — Dr. Martin',
    statut: 'opérationnel',
    endpoints: [
      'GET  /api/patients',
      'POST /api/patients',
      'GET  /api/consultations',
      'POST /api/consultations',
      'POST /api/transcription',
      'POST /api/compte-rendu',
      'POST /api/demandes/generer-reponse',
      'POST /api/comptes-rendus/generer',
      'POST /api/rendez-vous/suggerer-creneaux',
      'POST /api/rappels/generer-message',
      'GET  /api/dashboard/stats',
    ],
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'medecin-backend',
  });
});

// Routes
app.use('/api/patients', patientsRoutes);
app.use('/api/consultations', consultationsRoutes);
app.use('/api/transcription', transcriptionRoutes);
app.use('/api/compte-rendu', compteRenduRoutes);
app.use('/api/demandes', demandesRoutes);
app.use('/api/comptes-rendus', comptesRendusRoutes);
app.use('/api/rendez-vous', rendezVousRoutes);
app.use('/api/rappels', rappelsRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Route inconnue
app.use((req, res) => {
  res.status(404).json({
    erreur: `Route introuvable : ${req.method} ${req.path}`,
  });
});

// Gestion globale des erreurs
app.use((err, req, res, next) => {
  console.error('Erreur non gérée :', err.stack || err.message || err);

  if (err.message && err.message.startsWith('Origine non autorisée par CORS')) {
    return res.status(403).json({ erreur: err.message });
  }

  res.status(500).json({ erreur: 'Erreur interne du serveur.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur lancé sur le port ${PORT}`);
});