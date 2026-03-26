const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Stockage temporaire sur disque (Whisper nécessite un vrai fichier)
const upload = multer({
  dest: path.join(__dirname, '../tmp/'),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max (limite Whisper)
  fileFilter: (req, file, cb) => {
    const formatsAcceptes = [
      'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm',
      'audio/ogg', 'audio/flac', 'audio/x-m4a', 'video/webm',
    ];
    if (formatsAcceptes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format audio non supporté. Utilisez mp3, mp4, wav, webm, ogg ou flac.'));
    }
  },
});

// POST /api/transcription — transcrit un fichier audio avec Whisper
router.post('/', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ erreur: 'Aucun fichier audio fourni. Champ attendu : "audio".' });
  }

  const cheminFichier = req.file.path;

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(cheminFichier),
      model: 'whisper-1',
      language: 'fr',
      response_format: 'text',
    });

    res.json({ transcription });
  } catch (error) {
    console.error('Erreur Whisper :', error.message);
    res.status(500).json({ erreur: 'Erreur lors de la transcription audio.' });
  } finally {
    // Supprimer le fichier temporaire dans tous les cas
    fs.unlink(cheminFichier, (err) => {
      if (err) console.error('Impossible de supprimer le fichier temporaire :', err.message);
    });
  }
});

// Gestion des erreurs multer (taille, format)
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ erreur: 'Fichier trop volumineux. Taille maximale : 25 Mo.' });
  }
  if (err.message) {
    return res.status(400).json({ erreur: err.message });
  }
  next(err);
});

module.exports = router;
