
import { createClient } from '@supabase/supabase-js';

// WARNING: ONLY use this on the server-side! 
// Never expose this client to the browser.

export function createAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    );
}
