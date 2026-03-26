const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

const HORAIRES = [
  { h: 9, m: 0 }, { h: 9, m: 30 },
  { h: 10, m: 0 }, { h: 10, m: 30 },
  { h: 11, m: 0 }, { h: 11, m: 30 },
  { h: 14, m: 0 }, { h: 14, m: 30 },
  { h: 15, m: 0 }, { h: 15, m: 30 },
  { h: 16, m: 0 }, { h: 16, m: 30 },
  { h: 17, m: 0 }, { h: 17, m: 30 },
];

function formatCreneau(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${JOURS_FR[date.getDay()]} ${date.getDate()} ${MOIS_FR[date.getMonth()]} à ${h}:${m}`;
}

// GET /api/rendez-vous — liste des rendez-vous avec info patient
router.get('/', async (req, res) => {
  console.log('[GET /api/rendez-vous] Requête reçue — query:', req.query);

  try {
    const { patient_id } = req.query;

    let query = supabase
      .from('rendez_vous')
      .select(`
        id,
        patient_id,
        date_heure,
        motif,
        statut,
        created_at,
        patients ( id, nom, telephone, email )
      `)
      .order('date_heure', { ascending: true });

    if (patient_id) {
      console.log('[GET /api/rendez-vous] Filtre patient_id:', patient_id);
      query = query.eq('patient_id', patient_id);
    }

    const { data, error } = await query;

    console.log('[GET /api/rendez-vous] Réponse Supabase — data:', data ? `${data.length} entrées` : 'null', '| error:', error ? error.message : 'aucune');

    if (error) {
      console.error('[GET /api/rendez-vous] Erreur Supabase:', error.message, '| code:', error.code);
      return res.status(500).json({ erreur: 'Erreur lors de la récupération des rendez-vous.' });
    }

    // Sécurité : data peut être null si Supabase ne retourne rien (timeout, RLS, table vide)
    const liste = Array.isArray(data) ? data : [];

    console.log('[GET /api/rendez-vous] Succès —', liste.length, 'rendez-vous retournés');
    return res.json({ rendez_vous: liste, total: liste.length });

  } catch (err) {
    console.error('[GET /api/rendez-vous] Exception non gérée:', err.message || err);
    return res.status(500).json({ erreur: 'Erreur interne du serveur.' });
  }
});

// POST /api/rendez-vous — créer un rendez-vous
router.post('/', async (req, res) => {
  const { patient_id, motif, date_heure, statut = 'planifie' } = req.body;

  if (!patient_id || !motif || !date_heure) {
    return res.status(400).json({ erreur: 'Les champs patient_id, motif et date_heure sont requis.' });
  }

  const statutsValides = ['planifie', 'confirme', 'annule', 'termine'];
  if (!statutsValides.includes(statut)) {
    return res.status(400).json({ erreur: `Statut invalide. Valeurs acceptées : ${statutsValides.join(', ')}.` });
  }

  try {
    const { data, error } = await supabase
      .from('rendez_vous')
      .insert({ patient_id, motif, date_heure, statut })
      .select(`
        id,
        patient_id,
        date_heure,
        motif,
        statut,
        created_at,
        patients ( id, nom, telephone, email )
      `)
      .single();

    if (error) {
      console.error('Erreur Supabase :', error.message);
      return res.status(500).json({ erreur: 'Erreur lors de la création du rendez-vous.' });
    }

    res.status(201).json({ rendez_vous: data });
  } catch (error) {
    console.error('Erreur POST /rendez-vous :', error);
    res.status(500).json({ erreur: 'Erreur interne du serveur.' });
  }
});

// POST /api/rendez-vous/suggerer-creneaux
router.post('/suggerer-creneaux', async (req, res) => {
  const { date_reference, nombre_creneaux = 3 } = req.body;

  if (!date_reference) {
    return res.status(400).json({
      erreur: 'Le champ date_reference est requis (format ISO : YYYY-MM-DD).',
    });
  }

  const dateRef = new Date(date_reference);
  if (isNaN(dateRef.getTime())) {
    return res.status(400).json({
      erreur: 'Format de date invalide. Utilisez le format ISO : YYYY-MM-DD.',
    });
  }

  const nbCreneaux = parseInt(nombre_creneaux, 10);
  if (isNaN(nbCreneaux) || nbCreneaux < 1 || nbCreneaux > 10) {
    return res.status(400).json({
      erreur: 'Le nombre de créneaux doit être un entier entre 1 et 10.',
    });
  }

  try {
    const dateDebut = new Date(dateRef);
    dateDebut.setHours(0, 0, 0, 0);
    const dateFin = new Date(dateDebut);
    dateFin.setDate(dateFin.getDate() + 21);

    const { data: rdvExistants, error } = await supabase
      .from('rendez_vous')
      .select('date_heure')
      .in('statut', ['planifie', 'confirme'])
      .gte('date_heure', dateDebut.toISOString())
      .lte('date_heure', dateFin.toISOString());

    if (error) {
      console.error('Erreur Supabase :', error.message);
      return res.status(500).json({ erreur: 'Erreur lors de la récupération des rendez-vous existants.' });
    }

    const cleCreneauOccupe = (d) => {
      const date = new Date(d);
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
    };

    const creneauxOccupes = new Set(
      (rdvExistants || []).map((rdv) => cleCreneauOccupe(rdv.date_heure))
    );

    const maintenant = new Date();
    const creneauxDisponibles = [];
    const dateActuelle = new Date(dateDebut);

    for (let jour = 0; jour < 21 && creneauxDisponibles.length < nbCreneaux; jour++) {
      const jourSemaine = dateActuelle.getDay();

      if (jourSemaine !== 0 && jourSemaine !== 6) {
        for (const { h, m } of HORAIRES) {
          if (creneauxDisponibles.length >= nbCreneaux) break;

          const creneau = new Date(dateActuelle);
          creneau.setHours(h, m, 0, 0);

          const cle = cleCreneauOccupe(creneau);
          if (creneau > maintenant && !creneauxOccupes.has(cle)) {
            creneauxDisponibles.push({
              date_heure: creneau.toISOString(),
              format_affichage: formatCreneau(creneau),
            });
          }
        }
      }

      dateActuelle.setDate(dateActuelle.getDate() + 1);
    }

    res.json({ creneaux: creneauxDisponibles });
  } catch (error) {
    console.error('Erreur /rendez-vous/suggerer-creneaux :', error);
    res.status(500).json({ erreur: 'Erreur lors de la suggestion des créneaux.' });
  }
});

module.exports = router;
