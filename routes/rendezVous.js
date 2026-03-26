const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

// Créneaux horaires du cabinet : 9h-12h et 14h-18h, slots de 30 min
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
    // Récupérer les RDV occupés sur les 21 prochains jours
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

    // Normaliser les créneaux occupés (clé: "YYYY-MM-DD-HH-mm")
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

      // Ignorer samedi (6) et dimanche (0)
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
