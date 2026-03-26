const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// GET /api/patients — liste tous les patients
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .order('nom', { ascending: true });

    if (error) {
      console.error('Erreur Supabase :', error.message);
      return res.status(500).json({ erreur: 'Erreur lors de la récupération des patients.' });
    }

    res.json({ patients: data, total: data.length });
  } catch (error) {
    console.error('Erreur GET /patients :', error);
    res.status(500).json({ erreur: 'Erreur interne du serveur.' });
  }
});

// POST /api/patients — créer un patient
router.post('/', async (req, res) => {
  const { nom, telephone, email, date_naissance } = req.body;

  if (!nom || nom.trim().length < 2) {
    return res.status(400).json({ erreur: 'Le nom du patient est requis (minimum 2 caractères).' });
  }

  try {
    const { data, error } = await supabase
      .from('patients')
      .insert({ nom: nom.trim(), telephone, email, date_naissance })
      .select()
      .single();

    if (error) {
      console.error('Erreur Supabase :', error.message);
      return res.status(500).json({ erreur: 'Erreur lors de la création du patient.' });
    }

    res.status(201).json({ patient: data });
  } catch (error) {
    console.error('Erreur POST /patients :', error);
    res.status(500).json({ erreur: 'Erreur interne du serveur.' });
  }
});

module.exports = router;
