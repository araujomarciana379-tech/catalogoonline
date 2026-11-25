"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAdmin } from "@/lib/admin";
import { MARCA_CURTA } from "@/lib/site";

export type Papel = "admin" | "vendedora" | "editor";

/**
 * Mostra o conteúdo para administrador e vendedora (somenteAdmin: só administrador); senão, login / criar acesso.
 * semAcesso: tela própria para quem entrou mas ainda não tem papel (usada no convite da vendedora).
 */
export function AdminGate({
  children,
  somenteAdmin = false,
  permitirEditor = false,
  semAcesso,
}: {
  children: (email: string, sair: () => void, papel: Papel, vendedora: { id: string; nome: string } | null) => ReactNode;
  somenteAdmin?: boolean;
  /** Telas que o editor também abre (Catálogos e o editor de carrinhos); nas demais ele vai para Catálogos. */
  permitirEditor?: boolean;
  semAcesso?: (email: string, sair: () => void) => ReactNode;
}) {
  const { estado, sair } = useAdmin();

  if (estado.tipo === "carregando") return <Tela>Carregando…</Tela>;
  if (estado.tipo === "admin") return <>{children(estado.email, () => void sair(), "admin", null)}</>;
  if (estado.tipo === "editor") {
    if (permitirEditor) return <>{children(estado.email, () => void sair(), "editor", null)}</>;
    return <IrParaCatalogos />;
  }
  if (estado.tipo === "vendedora") {
    if (!somenteAdmin) return <>{children(estado.email, () => void sair(), "vendedora", estado.vendedora)}</>;
    return (
      <Tela>
        <div className="max-w-sm space-y-3 text-center">
          <p className="text-lg font-semibold">Área do administrador</p>
          <p className="text-sm text-slate-600">Você entrou como vendedora ({estado.vendedora.nome}) e esta tela é só para o administrador.</p>
          <a href="/admin/pedidos" className="inline-block rounded-lg bg-marca px-4 py-2 text-sm font-semibold text-white">Ir para meus pedidos</a>
          <div><button onClick={() => void sair()} className="text-sm text-marca underline">Sair</button></div>
        </div>
      </Tela>
    );
  }
  if (estado.tipo === "sem-acesso" && semAcesso) return <Tela>{semAcesso(estado.email, () => void sair())}</Tela>;
  if (estado.tipo === "sem-acesso")
    return (
      <Tela>
        <div className="max-w-sm space-y-3 text-center">
          <p className="text-lg font-semibold">Conta criada: {estado.email}</p>
          <p className="text-sm text-slate-600">
            Ela ainda não tem acesso ao painel. Peça a liberação informando este e-mail
            (vendedoras entram pelo link de convite enviado pelo administrador).
          </p>
          <button onClick={() => void sair()} className="text-sm text-marca underline">Sair</button>
        </div>
      </Tela>
    );
  return <Login />;
}

function IrParaCatalogos() {
  const router = useRouter();
  useEffect(() => router.replace("/admin/catalogos"), [router]);
  return <Tela>Abrindo Catálogos…</Tela>;
}

function Tela({ children }: { children: ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center bg-slate-100 p-6 text-slate-900">{children}</main>;
}

function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [msg, setMsg] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function entrar(criar: boolean) {
    setMsg(null);
    if (!email.includes("@") || senha.length < 8) return setMsg({ tipo: "erro", texto: "Informe o e-mail e uma senha de pelo menos 8 caracteres." });
    setOcupado(true);
    const r = criar
      ? await supabase.auth.signUp({ email: email.trim(), password: senha })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setOcupado(false);
    if (r.error) {
      const t = /invalid login/i.test(r.error.message)
        ? "E-mail ou senha incorretos."
        : /not confirmed/i.test(r.error.message)
          ? "Confirme o e-mail pelo link que enviamos (se a página do link der erro, tudo bem: a confirmação vale)."
          : r.error.message;
      return setMsg({ tipo: "erro", texto: t });
    }
    if (criar && !r.data.session)
      setMsg({ tipo: "ok", texto: "Conta criada! Confirme pelo link enviado ao seu e-mail e depois entre aqui." });
  }

  return (
    <Tela>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void entrar(false);
        }}
        className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-6 shadow-xl"
      >
        <h1 className="text-xl font-bold text-marca">Painel {MARCA_CURTA}</h1>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="E-mail"
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-marca" />
        <input value={senha} onChange={(e) => setSenha(e.target.value)} type="password" autoComplete="current-password" placeholder="Senha"
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-marca" />
        {msg && <p className={`text-sm ${msg.tipo === "erro" ? "text-red-600" : "text-emerald-700"}`}>{msg.texto}</p>}
        <button disabled={ocupado} className="w-full rounded-lg bg-marca py-2.5 font-semibold text-white disabled:opacity-50">Entrar</button>
        <button type="button" disabled={ocupado} onClick={() => void entrar(true)} className="w-full text-sm text-slate-600 underline">
          Primeiro acesso? Criar conta
        </button>
      </form>
    </Tela>
  );
}
