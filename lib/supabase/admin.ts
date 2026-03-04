// Supabase admin client with service role (for server-side operations)
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
    if (typeof window !== "undefined") {
        throw new Error("createAdminClient can only be used on the server.");
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error("Missing Supabase admin environment variables.");
    }

    return createSupabaseClient(
        supabaseUrl,
        serviceRoleKey,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        }
    );
}
