const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { genererTexteIA } = require('../services/openai');

// POST /api/compte-rendu — structure un texte libre en compte rendu médical et sauvegarde
router.post('/', async (req, res) => {
  const { texte_brut, patient_id, rendez_vous_id } = req.body;

  if (!texte_brut) {
    return res.status(400).json({ erreur: 'Le champ texte_brut est requis.' });
  }
  if (!patient_id) {
    return res.status(400).json({ erreur: 'Le champ patient_id est requis.' });
  }
  if (texte_brut.trim().length < 10) {
    return res.status(400).json({ erreur: 'Le texte est trop court pour générer un compte rendu.' });
  }

  try {
    const systemPrompt = `Tu es un assistant médical expert qui aide le Dr. Martin à rédiger des comptes rendus de consultation structurés.
À partir de notes libres (dictées ou tapées), tu extrais et reformules les informations médicales clés.
Utilise un vocabulaire médical français professionnel et précis.
Réponds UNIQUEMENT en JSON valide, sans texte autour. Format strict :
{
  "motif": "...",
  "symptomes": "...",
  "diagnostic": "...",
  "traitement": "..."
}
Si une information est absente, écris "Non mentionné".`;

    const userPrompt = `Analyse et structure ces notes de consultation médicale :

"${texte_brut}"

Extrais : le motif de consultation, les symptômes rapportés ou observés, le diagnostic posé, et le traitement ou les recommandations prescrites.`;

    let structured;
    try {
      const iaResponse = await genererTexteIA(userPrompt, systemPrompt, { temperature: 0.2 });
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
        rendez_vous_id: rendez_vous_id || null,
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
      patient_id: data.patient_id,
      motif: data.motif,
      symptomes: data.symptomes,
      diagnostic: data.diagnostic,
      traitement: data.traitement,
      created_at: data.created_at,
    });
  } catch (error) {
    console.error('Erreur POST /compte-rendu :', error);
    res.status(500).json({ erreur: 'Erreur lors de la génération du compte rendu.' });
  }
});

module.exports = router;
