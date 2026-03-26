const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// Requête Supabase sécurisée — ne throw jamais
async function safeQuery(queryBuilder, label) {
  try {
    const result = await queryBuilder;
    if (result.error) {
      console.error(`[${label}] Erreur Supabase:`, result.error.message, '| code:', result.error.code);
    }
    return result;
  } catch (err) {
    console.error(`[${label}] Exception:`, err?.message || String(err));
    return { data: null, error: { message: err?.message || 'Exception inconnue', code: 'EXCEPTION' } };
  }
}

// GET /api/consultations — liste les comptes rendus (sans join implicite)
router.get('/', async (req, res) => {
  console.log('[GET /consultations] Requête reçue — query:', JSON.stringify(req.query));
  try {
    const { patient_id } = req.query;

    // ── Étape 1 : comptes_rendus sans join ──
    let rdQuery = supabase
      .from('comptes_rendus')
      .select('id, patient_id, rendez_vous_id, texte_brut, motif, symptomes, diagnostic, traitement, created_at')
      .order('created_at', { ascending: false });

    if (patient_id) rdQuery = rdQuery.eq('patient_id', patient_id);

    const { data: crData, error: crError } = await safeQuery(rdQuery, 'GET /consultations → comptes_rendus');

    if (crError) {
      console.error('[GET /consultations] Table comptes_rendus inaccessible:', crError.message);
      return res.status(200).json({
        consultations: [],
        total: 0,
        warning: `Table comptes_rendus inaccessible : ${crError.message}`,
      });
    }

    const liste = Array.isArray(crData) ? crData : [];
    console.log('[GET /consultations] comptes_rendus récupérés:', liste.length);

    // ── Étape 2 : patients (requête séparée) ──
    let patientsMap = {};
    const patientIds = [...new Set(liste.map((c) => c.patient_id).filter(Boolean))];

    if (patientIds.length > 0) {
      const { data: patientsData, error: patientsError } = await safeQuery(
        supabase.from('patients').select('id, nom, telephone, email').in('id', patientIds),
        'GET /consultations → patients'
      );
      if (patientsError) {
        console.warn('[GET /consultations] Patients inaccessibles, on continue sans:', patientsError.message);
      } else {
        patientsMap = (Array.isArray(patientsData) ? patientsData : []).reduce((acc, p) => {
          acc[p.id] = p;
          return acc;
        }, {});
      }
    }

    // ── Étape 3 : fusion côté Node ──
    const resultat = liste.map((cr) => ({
      ...cr,
      patients: patientsMap[cr.patient_id] || null,
    }));

    console.log('[GET /consultations] Succès —', resultat.length, 'consultations retournées');
    return res.status(200).json({ consultations: resultat, total: resultat.length });

  } catch (err) {
    console.error('[GET /consultations] Exception non gérée:', err?.message || String(err));
    return res.status(200).json({
      consultations: [],
      total: 0,
      warning: `Erreur serveur : ${err?.message || 'inconnue'}`,
    });
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
    const { data, error } = await safeQuery(
      supabase
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
        .single(),
      'POST /consultations → insert'
    );

    if (error) {
      console.error('[POST /consultations] Erreur:', error.message);
      return res.status(500).json({ erreur: error.message || 'Erreur lors de la création de la consultation.' });
    }

    return res.status(201).json({ consultation: data });
  } catch (err) {
    console.error('[POST /consultations] Exception non gérée:', err?.message || String(err));
    return res.status(500).json({ erreur: 'Erreur interne du serveur.' });
  }
});

module.exports = router;
