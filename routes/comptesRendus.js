const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { genererTexteIA } = require('../services/openai');

// POST /api/comptes-rendus/generer
router.post('/generer', async (req, res) => {
  const { texte_brut, patient_id } = req.body;

  if (!texte_brut || !patient_id) {
    return res.status(400).json({
      erreur: 'Les champs texte_brut et patient_id sont requis.',
    });
  }

  if (texte_brut.trim().length < 10) {
    return res.status(400).json({
      erreur: 'Le texte brut est trop court pour générer un compte rendu.',
    });
  }

  try {
    const systemPrompt = `Tu es un assistant médical qui structure les comptes rendus de consultation du Dr. Martin.
À partir de notes libres du médecin, tu extrais les informations médicales clés.
Utilise un vocabulaire médical français professionnel.
Réponds UNIQUEMENT en JSON valide, sans aucun texte autour. Format strict :
{
  "motif": "...",
  "symptomes": "...",
  "diagnostic": "...",
  "traitement": "..."
}
Si une information est absente des notes, écris "Non mentionné".`;

    const userPrompt = `Analyse ces notes de consultation et structure-les :

"${texte_brut}"

Extrais : motif de consultation, symptômes, diagnostic, traitement ou recommandations.`;

    let structured;
    try {
      const iaResponse = await genererTexteIA(userPrompt, systemPrompt, { temperature: 0.3 });
      const jsonMatch = iaResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Réponse IA non JSON');
      structured = JSON.parse(jsonMatch[0]);
    } catch (iaError) {
      console.error('Erreur OpenAI (fallback activé) :', iaError.message);
      structured = {
        motif: 'Consultation médicale',
        symptomes: 'À compléter par le médecin',
        diagnostic: 'À compléter par le médecin',
        traitement: 'À compléter par le médecin',
      };
    }

    // Sauvegarder dans Supabase
    const { data, error } = await supabase
      .from('comptes_rendus')
      .insert({
        patient_id,
        texte_brut,
        motif: structured.motif,
        symptomes: structured.symptomes,
        diagnostic: structured.diagnostic,
        traitement: structured.traitement,
      })
      .select()
      .single();

    if (error) {
      console.error('Erreur Supabase :', error.message);
      return res.status(500).json({ erreur: 'Erreur lors de la sauvegarde du compte rendu.' });
    }

    res.status(201).json({
      id: data.id,
      motif: structured.motif,
      symptomes: structured.symptomes,
      diagnostic: structured.diagnostic,
      traitement: structured.traitement,
    });
  } catch (error) {
    console.error('Erreur /comptes-rendus/generer :', error);
    res.status(500).json({ erreur: 'Erreur lors de la génération du compte rendu.' });
  }
});

module.exports = router;
