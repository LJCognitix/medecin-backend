const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { genererTexteIA } = require('../services/openai');

const TYPES_VALIDES = ['rendez-vous', 'ordonnance', 'question', 'urgence'];

// POST /api/demandes/generer-reponse
router.post('/generer-reponse', async (req, res) => {
  const { demande_id, type, message, nom_patient } = req.body;

  if (!demande_id || !type || !message || !nom_patient) {
    return res.status(400).json({
      erreur: 'Les champs demande_id, type, message et nom_patient sont requis.',
    });
  }

  if (!TYPES_VALIDES.includes(type)) {
    return res.status(400).json({
      erreur: `Type invalide. Valeurs acceptées : ${TYPES_VALIDES.join(', ')}.`,
    });
  }

  try {
    const prenom = nom_patient.split(' ')[0];

    const systemPrompt = `Tu es l'assistant du Dr. Martin, médecin généraliste à Vallon-Pont-d'Arc.
Tu génères des réponses professionnelles, empathiques et personnalisées en français médical adapté.
Commence toujours par une salutation avec le prénom du patient.
Termine toujours par la signature "Dr. Martin".
${type === 'urgence'
  ? 'Le ton doit être direct, rassurant et indiquer si une consultation immédiate est nécessaire.'
  : 'Le ton doit être bienveillant, clair et professionnel.'}`;

    const userPrompt = `Génère une réponse pour ${prenom} qui a soumis une demande de type "${type}" :
"${message}"

La réponse doit être adaptée au type de demande, personnalisée, et en français médical professionnel.`;

    let reponseGeneree;
    try {
      reponseGeneree = await genererTexteIA(userPrompt, systemPrompt);
    } catch (iaError) {
      console.error('Erreur OpenAI (fallback activé) :', iaError.message);
      reponseGeneree = `Bonjour ${prenom},\n\nNous avons bien reçu votre demande. Le Dr. Martin va l'examiner et vous répondra dans les meilleurs délais.\n\nCordialement,\nDr. Martin`;
    }

    // Sauvegarder la réponse dans Supabase
    const { error: updateError } = await supabase
      .from('demandes')
      .update({ reponse_ia: reponseGeneree })
      .eq('id', demande_id);

    if (updateError) {
      console.error('Erreur mise à jour Supabase :', updateError.message);
      // On ne bloque pas la réponse si la mise à jour échoue
    }

    res.json({ reponse_generee: reponseGeneree });
  } catch (error) {
    console.error('Erreur /generer-reponse :', error);
    res.status(500).json({ erreur: 'Erreur lors de la génération de la réponse.' });
  }
});

module.exports = router;
