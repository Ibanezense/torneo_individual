// Supabase client for browser (client components)
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // During build time, env vars might not be set
    if (!supabaseUrl || !supabaseAnonKey) {
        // Return a dummy client that will be replaced at runtime
        return createBrowserClient(
            "https://placeholder.supabase.co",
            "placeholder-key"
        );
    }

    return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
