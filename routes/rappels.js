const express = require('express');
const router = express.Router();
const { genererTexteIA } = require('../services/openai');

const TYPES_VALIDES = ['traitement', 'controle', 'suivi'];

const DESCRIPTIONS_TYPE = {
  traitement: 'rappel pour la prise d\'un médicament ou le suivi d\'un traitement en cours',
  controle: 'incitation bienveillante à prendre un rendez-vous de contrôle médical',
  suivi: 'prise de nouvelles du patient après une consultation récente',
};

const FALLBACKS = {
  traitement: (prenom) =>
    `Bonjour ${prenom},\n\nJe souhaitais vous rappeler de bien continuer votre traitement en cours. Si vous avez la moindre question ou ressentez des effets indésirables, n'hésitez pas à contacter le cabinet.\n\nBien cordialement,\nDr. Martin`,
  controle: (prenom) =>
    `Bonjour ${prenom},\n\nIl serait utile de prévoir un rendez-vous de contrôle prochainement. Vous pouvez nous appeler ou prendre rendez-vous directement via notre plateforme.\n\nBien cordialement,\nDr. Martin`,
  suivi: (prenom) =>
    `Bonjour ${prenom},\n\nSuite à votre dernière consultation, je voulais prendre de vos nouvelles. Comment vous sentez-vous ? N'hésitez pas à nous contacter si vous avez besoin de quoi que ce soit.\n\nBien cordialement,\nDr. Martin`,
};

// POST /api/rappels/generer-message
router.post('/generer-message', async (req, res) => {
  const { patient_id, type, nom_patient } = req.body;

  if (!patient_id || !type || !nom_patient) {
    return res.status(400).json({
      erreur: 'Les champs patient_id, type et nom_patient sont requis.',
    });
  }

  if (!TYPES_VALIDES.includes(type)) {
    return res.status(400).json({
      erreur: `Type invalide. Valeurs acceptées : ${TYPES_VALIDES.join(', ')}.`,
    });
  }

  try {
    const prenom = nom_patient.split(' ')[0];

    const systemPrompt = `Tu es l'assistant bienveillant du Dr. Martin, médecin généraliste à Vallon-Pont-d'Arc.
Tu génères des messages de rappel courts, chaleureux et respectueux en français.
Le message ne doit pas être infantilisant ni alarmiste.
Commence par le prénom du patient.
Termine par "Bien cordialement,\nDr. Martin".
Maximum 4 à 5 phrases.`;

    const userPrompt = `Génère un message de rappel de type "${type}" pour ${prenom}.
Description du type : ${DESCRIPTIONS_TYPE[type]}.`;

    let message;
    try {
      message = await genererTexteIA(userPrompt, systemPrompt, { temperature: 0.75, max_tokens: 300 });
    } catch (iaError) {
      console.error('Erreur OpenAI (fallback activé) :', iaError.message);
      message = FALLBACKS[type](prenom);
    }

    res.json({ message });
  } catch (error) {
    console.error('Erreur /rappels/generer-message :', error);
    res.status(500).json({ erreur: 'Erreur lors de la génération du message de rappel.' });
  }
});

module.exports = router;
