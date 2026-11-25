// Utilidades dos scripts de importação (rodam no computador de quem administra, nunca no navegador).
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/** Lê .env.local sem depender de flags do Node (funciona igual no Windows). */
export function carregarEnv(arquivo = ".env.local") {
  if (!existsSync(arquivo)) return;
  for (const linha of readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/** Cliente com a chave de serviço: ignora o RLS, por isso só existe neste script local. */
export function clienteAdmin() {
  carregarEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    falhar(
      "Faltam variáveis no .env.local:\n" +
        "  NEXT_PUBLIC_SUPABASE_URL=...\n" +
        "  SUPABASE_SERVICE_ROLE_KEY=...   (Supabase > Project Settings > API Keys > secret / service_role)\n" +
        "Use --seco para testar sem enviar nada.",
    );
  }
  return createClient(url, chave, { auth: { persistSession: false } });
}

/** Argumentos no formato: posicionais + --chave valor + --flag */
export function lerArgs(argv = process.argv.slice(2)) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const prox = argv[i + 1];
      if (prox !== undefined && !prox.startsWith("--")) {
        opt[k] = prox;
        i++;
      } else opt[k] = true;
    } else pos.push(a);
  }
  return { pos, opt };
}

export function falhar(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

export const slugValido = (s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);
