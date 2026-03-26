const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// Requête Supabase sécurisée — ne throw jamais, retourne { data, error, count }
async function safeQuery(queryBuilder, label) {
  try {
    const result = await queryBuilder;
    if (result.error) {
      console.warn(`[dashboard] ${label} — erreur Supabase: ${result.error.message}`);
    }
    return result;
  } catch (err) {
    console.error(`[dashboard] ${label} — exception:`, err?.message || String(err));
    return { data: null, count: null, error: { message: err?.message || 'Exception inconnue' } };
  }
}

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
  console.log('[GET /dashboard/stats] Requête reçue');

  try {
    const maintenant = new Date();
    const debutJour = new Date(maintenant);
    debutJour.setHours(0, 0, 0, 0);
    const finJour = new Date(maintenant);
    finJour.setHours(23, 59, 59, 999);

    // ── Toutes les requêtes en parallèle, chacune isolée ──
    const [resDemandesCount, resRdvCount, resRappelsCount, resDemandesRecentes] = await Promise.all([
      safeQuery(
        supabase
          .from('demandes')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', debutJour.toISOString())
          .lte('created_at', finJour.toISOString()),
        'count demandes aujourd\'hui'
      ),
      safeQuery(
        supabase
          .from('rendez_vous')
          .select('*', { count: 'exact', head: true })
          .gte('date_heure', debutJour.toISOString())
          .lte('date_heure', finJour.toISOString())
          .neq('statut', 'annule'),
        'count rendez_vous aujourd\'hui'
      ),
      safeQuery(
        supabase
          .from('rappels')
          .select('*', { count: 'exact', head: true })
          .eq('envoye', false),
        'count rappels à programmer'
      ),
      // Demandes récentes sans join implicite sur patients
      safeQuery(
        supabase
          .from('demandes')
          .select('id, patient_id, type, message, statut, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
        'demandes récentes'
      ),
    ]);

    // ── Récupération des patients liés aux demandes récentes (requête séparée) ──
    let patientsMap = {};
    const demandesListe = Array.isArray(resDemandesRecentes.data) ? resDemandesRecentes.data : [];
    const patientIds = [...new Set(demandesListe.map((d) => d.patient_id).filter(Boolean))];

    if (patientIds.length > 0) {
      const { data: patientsData } = await safeQuery(
        supabase.from('patients').select('id, nom').in('id', patientIds),
        'patients des demandes récentes'
      );
      patientsMap = (Array.isArray(patientsData) ? patientsData : []).reduce((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {});
    }

    // ── Agrégation — chaque compteur est dégradé indépendamment ──
    const demandesFormatees = demandesListe.map((d) => ({
      id: d.id,
      patient_nom: patientsMap[d.patient_id]?.nom ?? 'Inconnu',
      type: d.type,
      message: d.message,
      statut: d.statut,
      created_at: d.created_at,
    }));

    console.log('[GET /dashboard/stats] Succès —',
      'demandes:', resDemandesCount.count ?? 0,
      '| rdv:', resRdvCount.count ?? 0,
      '| rappels:', resRappelsCount.count ?? 0,
      '| récentes:', demandesFormatees.length
    );

    return res.status(200).json({
      demandes_aujourdhui: resDemandesCount.count ?? 0,
      rendez_vous_aujourdhui: resRdvCount.count ?? 0,
      rappels_a_programmer: resRappelsCount.count ?? 0,
      demandes_recentes: demandesFormatees,
    });

  } catch (err) {
    console.error('[GET /dashboard/stats] Exception non gérée:', err?.message || String(err));
    // Réponse dégradée — le dashboard affiche des zéros plutôt qu'un crash
    return res.status(200).json({
      demandes_aujourdhui: 0,
      rendez_vous_aujourdhui: 0,
      rappels_a_programmer: 0,
      demandes_recentes: [],
      warning: `Erreur serveur : ${err?.message || 'inconnue'}`,
    });
  }
});

module.exports = router;
