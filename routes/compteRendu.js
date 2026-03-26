const express = require('express');
const router = express.Router();
const { genererTexteIA } = require('../services/openai');

// POST /api/compte-rendu — analyse un texte et retourne un compte rendu structuré (sans sauvegarde)
// La sauvegarde se fait séparément via POST /api/consultations
router.post('/', async (req, res) => {
  const { texte_brut } = req.body;

  if (!texte_brut) {
    return res.status(400).json({ erreur: 'Le champ texte_brut est requis.' });
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

    res.json({
      motif: structured.motif,
      symptomes: structured.symptomes,
      diagnostic: structured.diagnostic,
      traitement: structured.traitement,
    });
  } catch (error) {
    console.error('Erreur POST /compte-rendu :', error);
    res.status(500).json({ erreur: 'Erreur lors de l\'analyse du compte rendu.' });
  }
});

module.exports = router;
