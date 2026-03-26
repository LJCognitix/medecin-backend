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
  console.log('[GET /rendez-vous] Requête reçue — query:', JSON.stringify(req.query));

  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      console.error('[GET /rendez-vous] TIMEOUT — Supabase ne répond pas après 9s');
      res.status(504).json({ erreur: 'La base de données ne répond pas. Réessayez dans quelques secondes.' });
    }
  }, 9000);

  try {
    const { patient_id } = req.query;

    let queryBuilder = supabase
      .from('rendez_vous')
      .select('id, patient_id, date_heure, motif, statut, created_at')
      .order('date_heure', { ascending: true });

    if (patient_id) {
      console.log('[GET /rendez-vous] Filtre patient_id:', patient_id);
      queryBuilder = queryBuilder.eq('patient_id', patient_id);
    }

    console.log('[GET /rendez-vous] Envoi requête Supabase sur rendez_vous...');
    const { data, error } = await queryBuilder;

    clearTimeout(timeoutId);

    if (res.headersSent) {
      console.warn('[GET /rendez-vous] Réponse déjà envoyée, abandon.');
      return;
    }

    if (error) {
      console.error('[GET /rendez-vous] Erreur Supabase rendez_vous:', error.message, '| code:', error.code, '| details:', error.details);
      return res.status(500).json({ erreur: error.message || 'Erreur base de données.' });
    }

    const liste = Array.isArray(data) ? data : [];
    console.log('[GET /rendez-vous] Rendez-vous récupérés:', liste.length);

    const patientIds = [...new Set(
      liste
        .map((rdv) => rdv.patient_id)
        .filter(Boolean)
    )];

    let patientsMap = {};

    if (patientIds.length > 0) {
      console.log('[GET /rendez-vous] Récupération patients liés:', patientIds.length);

      const { data: patientsData, error: patientsError } = await supabase
        .from('patients')
        .select('id, nom, telephone, email')
        .in('id', patientIds);

      if (patientsError) {
        console.error('[GET /rendez-vous] Erreur Supabase patients:', patientsError.message, '| code:', patientsError.code, '| details:', patientsError.details);
        return res.status(500).json({ erreur: patientsError.message || 'Erreur base de données sur les patients.' });
      }

      const patientsListe = Array.isArray(patientsData) ? patientsData : [];
      patientsMap = patientsListe.reduce((acc, patient) => {
        acc[patient.id] = patient;
        return acc;
      }, {});
    }

    const resultat = liste.map((rdv) => ({
      ...rdv,
      patients: rdv.patient_id ? (patientsMap[rdv.patient_id] || null) : null,
    }));

    console.log('[GET /rendez-vous] Succès —', resultat.length, 'rendez-vous retournés');
    return res.json({ rendez_vous: resultat, total: resultat.length });

  } catch (err) {
    clearTimeout(timeoutId);
    console.error('[GET /rendez-vous] Exception non gérée dans le handler:', err?.message || String(err));
    if (!res.headersSent) {
      return res.status(500).json({ erreur: 'Erreur interne du serveur.' });
    }
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
      .select('id, patient_id, date_heure, motif, statut, created_at')
      .single();

    if (error) {
      console.error('[POST /rendez-vous] Erreur Supabase:', error.message, '| code:', error.code, '| details:', error.details);
      return res.status(500).json({ erreur: error.message || 'Erreur lors de la création du rendez-vous.' });
    }

    let patient = null;

    if (data?.patient_id) {
      const { data: patientData, error: patientError } = await supabase
        .from('patients')
        .select('id, nom, telephone, email')
        .eq('id', data.patient_id)
        .maybeSingle();

      if (patientError) {
        console.error('[POST /rendez-vous] Erreur récupération patient:', patientError.message);
      } else {
        patient = patientData || null;
      }
    }

    return res.status(201).json({
      rendez_vous: {
        ...data,
        patients: patient,
      },
    });
  } catch (err) {
    console.error('[POST /rendez-vous] Exception non gérée:', err?.message || String(err));
    return res.status(500).json({ erreur: 'Erreur interne du serveur.' });
  }
});

// POST /api/rendez-vous/suggerer-creneaux
router.post('/suggerer-creneaux', async (req, res) => {
  const { date_reference, nombre_creneaux = 3 } = req.body;

  if (!date_reference) {
    return res.status(400).json({ erreur: 'Le champ date_reference est requis (format ISO : YYYY-MM-DD).' });
  }

  const dateRef = new Date(date_reference);
  if (isNaN(dateRef.getTime())) {
    return res.status(400).json({ erreur: 'Format de date invalide. Utilisez le format ISO : YYYY-MM-DD.' });
  }

  const nbCreneaux = parseInt(nombre_creneaux, 10);
  if (isNaN(nbCreneaux) || nbCreneaux < 1 || nbCreneaux > 10) {
    return res.status(400).json({ erreur: 'Le nombre de créneaux doit être un entier entre 1 et 10.' });
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
      console.error('[POST /suggerer-creneaux] Erreur Supabase:', error.message);
      return res.status(500).json({ erreur: 'Erreur lors de la récupération des rendez-vous existants.' });
    }

    const cleCreneauOccupe = (d) => {
      const date = new Date(d);
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
    };

    const creneauxOccupes = new Set(
      (Array.isArray(rdvExistants) ? rdvExistants : []).map((rdv) => cleCreneauOccupe(rdv.date_heure))
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

    return res.json({ creneaux: creneauxDisponibles });
  } catch (err) {
    console.error('[POST /suggerer-creneaux] Exception non gérée:', err?.message || String(err));
    return res.status(500).json({ erreur: 'Erreur lors de la suggestion des créneaux.' });
  }
});

module.exports = router;