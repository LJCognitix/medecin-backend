const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
  try {
    const maintenant = new Date();
    const debutJour = new Date(maintenant);
    debutJour.setHours(0, 0, 0, 0);
    const finJour = new Date(maintenant);
    finJour.setHours(23, 59, 59, 999);

    // Toutes les requêtes en parallèle pour la performance
    const [
      { count: demandesAujourdhui, error: err1 },
      { count: rendezVousAujourdhui, error: err2 },
      { count: rappelsAProgrammer, error: err3 },
      { data: demandesRecentes, error: err4 },
    ] = await Promise.all([
      supabase
        .from('demandes')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', debutJour.toISOString())
        .lte('created_at', finJour.toISOString()),

      supabase
        .from('rendez_vous')
        .select('*', { count: 'exact', head: true })
        .gte('date_heure', debutJour.toISOString())
        .lte('date_heure', finJour.toISOString())
        .neq('statut', 'annule'),

      supabase
        .from('rappels')
        .select('*', { count: 'exact', head: true })
        .eq('envoye', false),

      supabase
        .from('demandes')
        .select(`
          id,
          type,
          message,
          statut,
          created_at,
          patients ( nom )
        `)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    const erreurs = [err1, err2, err3, err4].filter(Boolean);
    if (erreurs.length > 0) {
      console.error('Erreurs Supabase dashboard :', erreurs.map((e) => e.message));
      return res.status(500).json({ erreur: 'Erreur lors de la récupération des statistiques.' });
    }

    const demandesFormatees = (demandesRecentes || []).map((d) => ({
      id: d.id,
      patient_nom: d.patients?.nom ?? 'Inconnu',
      type: d.type,
      message: d.message,
      statut: d.statut,
      created_at: d.created_at,
    }));

    res.json({
      demandes_aujourdhui: demandesAujourdhui ?? 0,
      rendez_vous_aujourdhui: rendezVousAujourdhui ?? 0,
      rappels_a_programmer: rappelsAProgrammer ?? 0,
      demandes_recentes: demandesFormatees,
    });
  } catch (error) {
    console.error('Erreur /dashboard/stats :', error);
    res.status(500).json({ erreur: 'Erreur lors de la récupération des statistiques du tableau de bord.' });
  }
});

module.exports = router;
