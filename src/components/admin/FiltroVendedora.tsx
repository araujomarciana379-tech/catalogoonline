"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Papel } from "./AdminGate";

export type VendedoraResumo = { id: string; nome: string };

/** Lista de vendedoras (só o administrador precisa; a vendedora só tem os dados dela). */
export function useVendedoras(papel: Papel): VendedoraResumo[] {
  const [lista, setLista] = useState<VendedoraResumo[]>([]);
  useEffect(() => {
    if (papel !== "admin") return;
    let vivo = true;
    supabase
      .from("vendedoras")
      .select("id, nome")
      .order("nome")
      .then(({ data }) => vivo && setLista((data ?? []) as VendedoraResumo[]));
    return () => {
      vivo = false;
    };
  }, [papel]);
  return lista;
}

export function FiltroVendedora({ valor, onChange, vendedoras }: { valor: string; onChange: (v: string) => void; vendedoras: VendedoraResumo[] }) {
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value)} aria-label="Filtrar por vendedora" className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
      <option value="todas">Todas as vendedoras</option>
      <option value="sem">Sem vendedora</option>
      {vendedoras.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
    </select>
  );
}
