const OpenAI = require('openai');

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Variable d\'environnement manquante: OPENAI_API_KEY est requise.');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

/**
 * Appel générique à l'API OpenAI.
 * @param {string} userPrompt - Le message utilisateur
 * @param {string} systemPrompt - Le contexte système
 * @param {object} options - Options optionnelles (temperature, max_tokens)
 * @returns {Promise<string>} - Le texte généré
 */
async function genererTexteIA(userPrompt, systemPrompt, options = {}) {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 600,
  });

  return completion.choices[0].message.content.trim();
}

module.exports = { genererTexteIA };
