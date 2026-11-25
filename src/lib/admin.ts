"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export type EstadoAdmin =
  | { tipo: "carregando" }
  | { tipo: "deslogado" }
  | { tipo: "sem-acesso"; email: string }
  | { tipo: "admin"; email: string }
  | { tipo: "editor"; email: string }
  | { tipo: "vendedora"; email: string; vendedora: { id: string; nome: string } };

/**
 * Sessão do painel. Quem é administrador ou vendedora é decidido no banco (tabelas admins/vendedoras + RLS);
 * aqui só mostramos a tela certa — nenhuma proteção depende deste código.
 */
export function useAdmin() {
  const [estado, setEstado] = useState<EstadoAdmin>({ tipo: "carregando" });

  useEffect(() => {
    let vivo = true;
    const avaliar = async () => {
      const { data } = await supabase.auth.getSession();
      const email = data.session?.user.email;
      const ok = email ? (await supabase.rpc("is_admin")).data : false;
      // Editor: só a aba Catálogos e os carrinhos das páginas (o banco confere cada escrita).
      const editor = email && !ok ? (await supabase.rpc("is_editor")).data === true : false;
      // Vendedora: o banco só devolve a linha dela (RLS); administrador nem precisa perguntar.
      const vend = email && !ok && !editor ? (await supabase.from("vendedoras").select("id, nome").eq("ativo", true).maybeSingle()).data : null;
      if (!vivo) return;
      setEstado(
        !email
          ? { tipo: "deslogado" }
          : ok
            ? { tipo: "admin", email }
            : editor
              ? { tipo: "editor", email }
              : vend
              ? { tipo: "vendedora", email, vendedora: vend as { id: string; nome: string } }
              : { tipo: "sem-acesso", email },
      );
    };
    // Dispara também na abertura. O setTimeout evita chamar o Supabase dentro do próprio aviso (pode travar o login).
    const { data } = supabase.auth.onAuthStateChange(() => setTimeout(() => void avaliar(), 0));
    return () => {
      vivo = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const sair = useCallback(() => supabase.auth.signOut(), []);
  return { estado, sair };
}
