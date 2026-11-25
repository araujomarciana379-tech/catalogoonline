"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminGate } from "@/components/admin/AdminGate";
import { supabase } from "@/lib/supabase";
import { MARCA_CURTA } from "@/lib/site";

/** Vendedora abre o link de convite, cria a conta (ou entra) e liga o acesso ao cadastro dela. */
export function Convite({ codigo }: { codigo: string }) {
  return (
    <AdminGate semAcesso={(email, sair) => <Aceitar codigo={codigo} email={email} sair={sair} />}>
      {(email, sair, papel) => (
        <main className="flex min-h-dvh items-center justify-center bg-slate-100 p-6 text-slate-900">
          <div className="max-w-sm space-y-3 text-center">
            <p className="text-lg font-semibold">Você já tem acesso ao painel{papel === "vendedora" ? " como vendedora" : ""}.</p>
            <p className="text-sm text-slate-600">Conta: {email}</p>
            <Link href="/admin" className="inline-block rounded-lg bg-marca px-4 py-2 text-sm font-semibold text-white">Abrir o painel</Link>
            <div><button onClick={sair} className="text-sm text-marca underline">Sair</button></div>
          </div>
        </main>
      )}
    </AdminGate>
  );
}

function Aceitar({ codigo, email, sair }: { codigo: string; email: string; sair: () => void }) {
  const router = useRouter();
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function aceitar() {
    setErro("");
    setOcupado(true);
    const { error } = await supabase.rpc("aceitar_convite", { p_codigo: codigo });
    if (error) {
      setOcupado(false);
      return setErro(/inv[aá]lido|j[aá] usado|invalid input/i.test(error.message) ? "Este convite é inválido ou já foi usado. Peça um novo ao administrador." : error.message);
    }
    router.push("/admin"); // o painel reavalia o acesso ao abrir
  }

  return (
    <div className="max-w-sm space-y-3 text-center">
      <p className="text-lg font-semibold text-marca">Convite para o painel {MARCA_CURTA}</p>
      <p className="text-sm text-slate-600">Você entrou como <strong>{email}</strong>. Confirme para liberar seu acesso de vendedora.</p>
      {!codigo && <p className="text-sm text-red-600">O link está incompleto. Abra o convite de novo pelo link que você recebeu.</p>}
      {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
      <button disabled={ocupado || !codigo} onClick={() => void aceitar()} className="w-full rounded-lg bg-marca py-2.5 font-semibold text-white disabled:opacity-50">
        {ocupado ? "Liberando…" : "Aceitar convite"}
      </button>
      <button onClick={sair} className="text-sm text-slate-600 underline">Entrar com outra conta</button>
    </div>
  );
}
