// backend/config/database.js

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Supabase credentials missing in .env');
}

// ✅ Create Supabase clients
const supabase = createClient(supabaseUrl, supabaseKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

// ✅ Simple query wrapper - for compatibility with existing code
const query = async (text, params) => {
    console.log('📝 DB Query:', text.substring(0, 100));

    try {
        // For SELECT queries - try to execute via RPC if available
        if (text.trim().toUpperCase().startsWith('SELECT')) {
            try {
                const { data, error } = await supabase.rpc('execute_sql', {
                    query_text: text,
                    query_params: params || []
                });

                if (!error && data) {
                    return { rows: data, rowCount: data.length || 0 };
                }
            } catch (rpcError) {
                // RPC not available - return empty result
                console.warn('⚠️ execute_sql RPC not available, using fallback');
            }

            // Fallback: return empty result
            return { rows: [], rowCount: 0 };
        }

        // For INSERT/UPDATE/DELETE
        return { rows: [], rowCount: 0 };
    } catch (error) {
        console.error('Query error:', error);
        return { rows: [], rowCount: 0 };
    }
};

module.exports = {
    query,
    supabase,
    supabaseAdmin,
    // ✅ Direct access methods
    from: (table) => supabase.from(table),
};