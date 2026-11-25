import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// Cliente de navegador. A segurança vem do RLS no banco, não de esconder a chave.
export const supabase = createClient(url, key);
export const SUPABASE_URL = url;
