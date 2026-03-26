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

// Requête Supabase sécurisée — ne throw jamais, retourne toujours { data, error }
async function safeQuery(queryBuilder, label) {
  try {
    const result = await queryBuilder;
    console.log(`[${label}] data:`, result.data === null ? 'null' : `${Array.isArray(result.data) ? result.data.length : '?'} éléments`, '| error:', result.error ? result.error.message : 'aucune');
    return result;
  } catch (err) {
    console.error(`[${label}] Exception pendant la requête:`, err?.message || String(err));
    return { data: null, error: { message: err?.message || 'Exception inconnue', code: 'EXCEPTION' } };
  }
}

// GET /api/rendez-vous — liste des rendez-vous avec info patient
// Toujours retourne une réponse JSON, même en mode dégradé
router.get('/', async (req, res) => {
  console.log('[GET /rendez-vous] Requête reçue — query:', JSON.stringify(req.query));

  // Timeout 9s — évite que Railway retourne 503 si Supabase ne répond pas
  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      console.error('[GET /rendez-vous] TIMEOUT 9s — Supabase ne répond pas');
      res.status(200).json({
        rendez_vous: [],
        total: 0,
        warning: 'La base de données ne répond pas. Les données seront disponibles dans quelques secondes.',
      });
    }
  }, 9000);

  try {
    const { patient_id } = req.query;

    // ── Étape 1 : requête sur rendez_vous (sans join implicite) ──
    console.log('[GET /rendez-vous] Requête rendez_vous...');
    let rdvQuery = supabase
      .from('rendez_vous')
      .select('id, patient_id, date_heure, motif, statut, created_at')
      .order('date_heure', { ascending: true });

    if (patient_id) rdvQuery = rdvQuery.eq('patient_id', patient_id);

    const { data: rdvData, error: rdvError } = await safeQuery(rdvQuery, 'GET /rendez-vous → rendez_vous');

    clearTimeout(timeoutId);
    if (res.headersSent) return;

    // Si la table rendez_vous est inaccessible → réponse dégradée (pas de crash)
    if (rdvError) {
      console.error('[GET /rendez-vous] Table rendez_vous inaccessible:', rdvError.message);
      return res.status(200).json({
        rendez_vous: [],
        total: 0,
        warning: `Table rendez_vous inaccessible : ${rdvError.message}`,
      });
    }

    const liste = Array.isArray(rdvData) ? rdvData : [];
    console.log('[GET /rendez-vous] rendez_vous récupérés:', liste.length);

    // ── Étape 2 : récupération des patients (requête séparée, sans join) ──
    let patientsMap = {};
    const patientIds = [...new Set(liste.map((r) => r.patient_id).filter(Boolean))];

    if (patientIds.length > 0) {
      console.log('[GET /rendez-vous] Requête patients pour', patientIds.length, 'ids...');
      const { data: patientsData, error: patientsError } = await safeQuery(
        supabase.from('patients').select('id, nom, telephone, email').in('id', patientIds),
        'GET /rendez-vous → patients'
      );

      if (patientsError) {
        // Patients inaccessibles → on continue sans eux (mode dégradé, pas de crash)
        console.warn('[GET /rendez-vous] Patients inaccessibles, on continue sans:', patientsError.message);
      } else {
        patientsMap = (Array.isArray(patientsData) ? patientsData : []).reduce((acc, p) => {
          acc[p.id] = p;
          return acc;
        }, {});
      }
    }

    // ── Étape 3 : fusion côté Node ──
    const resultat = liste.map((rdv) => ({
      ...rdv,
      patients: patientsMap[rdv.patient_id] || null,
    }));

    console.log('[GET /rendez-vous] Succès —', resultat.length, 'rendez-vous retournés');
    return res.status(200).json({ rendez_vous: resultat, total: resultat.length });

  } catch (err) {
    clearTimeout(timeoutId);
    console.error('[GET /rendez-vous] Exception non gérée:', err?.message || String(err));
    if (!res.headersSent) {
      return res.status(200).json({
        rendez_vous: [],
        total: 0,
        warning: `Erreur serveur : ${err?.message || 'inconnue'}`,
      });
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
    console.log('[POST /rendez-vous] Insertion rendez-vous...');
    const { data, error } = await safeQuery(
      supabase
        .from('rendez_vous')
        .insert({ patient_id, motif, date_heure, statut })
        .select('id, patient_id, date_heure, motif, statut, created_at')
        .single(),
      'POST /rendez-vous → insert'
    );

    if (error) {
      console.error('[POST /rendez-vous] Erreur:', error.message);
      return res.status(500).json({ erreur: error.message || 'Erreur lors de la création du rendez-vous.' });
    }

    // Récupération du patient séparément (sans join implicite)
    let patient = null;
    if (data?.patient_id) {
      const { data: patientData } = await safeQuery(
        supabase.from('patients').select('id, nom, telephone, email').eq('id', data.patient_id).maybeSingle(),
        'POST /rendez-vous → patient'
      );
      patient = patientData || null;
    }

    return res.status(201).json({ rendez_vous: { ...(data || {}), patients: patient } });
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

    const { data: rdvExistants, error } = await safeQuery(
      supabase
        .from('rendez_vous')
        .select('date_heure')
        .in('statut', ['planifie', 'confirme'])
        .gte('date_heure', dateDebut.toISOString())
        .lte('date_heure', dateFin.toISOString()),
      'POST /suggerer-creneaux → rendez_vous'
    );

    // Si la table est inaccessible, on génère des créneaux sans tenir compte des conflits
    if (error) {
      console.warn('[POST /suggerer-creneaux] rendez_vous inaccessible, créneaux sans filtre:', error.message);
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
          if (creneau > maintenant && !creneauxOccupes.has(cleCreneauOccupe(creneau))) {
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
