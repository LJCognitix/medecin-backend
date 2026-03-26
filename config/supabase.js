const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Variables d\'environnement manquantes: SUPABASE_URL et SUPABASE_ANON_KEY sont requises.'
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
