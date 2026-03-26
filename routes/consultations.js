const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// GET /api/consultations — liste les comptes rendus avec info patient
router.get('/', async (req, res) => {
  try {
    const { patient_id } = req.query;

    let query = supabase
      .from('comptes_rendus')
      .select(`
        id,
        texte_brut,
        motif,
        symptomes,
        diagnostic,
        traitement,
        created_at,
        patients ( id, nom, telephone, email ),
        rendez_vous ( id, date_heure, motif )
      `)
      .order('created_at', { ascending: false });

    if (patient_id) {
      query = query.eq('patient_id', patient_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erreur Supabase :', error.message);
      return res.status(500).json({ erreur: 'Erreur lors de la récupération des consultations.' });
    }

    res.json({ consultations: data, total: data.length });
  } catch (error) {
    console.error('Erreur GET /consultations :', error);
    res.status(500).json({ erreur: 'Erreur interne du serveur.' });
  }
});

// POST /api/consultations — créer un compte rendu manuellement
router.post('/', async (req, res) => {
  const { patient_id, rendez_vous_id, texte_brut, motif, symptomes, diagnostic, traitement } = req.body;

  if (!patient_id) {
    return res.status(400).json({ erreur: 'Le champ patient_id est requis.' });
  }
  if (!texte_brut) {
    return res.status(400).json({ erreur: 'Le champ texte_brut est requis.' });
  }

  try {
    const { data, error } = await supabase
      .from('comptes_rendus')
      .insert({
        patient_id,
        rendez_vous_id: rendez_vous_id || null,
        texte_brut,
        motif: motif || null,
        symptomes: symptomes || null,
        diagnostic: diagnostic || null,
        traitement: traitement || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Erreur Supabase :', error.message);
      return res.status(500).json({ erreur: 'Erreur lors de la création de la consultation.' });
    }

    res.status(201).json({ consultation: data });
  } catch (error) {
    console.error('Erreur POST /consultations :', error);
    res.status(500).json({ erreur: 'Erreur interne du serveur.' });
  }
});

module.exports = router;
