"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AdminGate, type Papel } from "./AdminGate";
import { MARCA_CURTA } from "@/lib/site";

type ItemMenu = { href: string; rotulo: string; icone: string; admin?: boolean; editor?: boolean };
const MENU: ItemMenu[] = [
  { href: "/admin", rotulo: "Visão geral", icone: "📊" },
  { href: "/admin/pedidos", rotulo: "Pedidos", icone: "🧾" },
  { href: "/admin/carrinhos", rotulo: "Carrinhos abandonados", icone: "🛒" },
  { href: "/admin/clientes", rotulo: "Clientes", icone: "👥" },
  { href: "/admin/vendedoras", rotulo: "Vendedoras", icone: "🧑‍💼", admin: true },
  { href: "/admin/catalogos", rotulo: "Catálogos", icone: "📚", admin: true, editor: true },
  { href: "/admin/produtos", rotulo: "Produtos", icone: "🏷️", admin: true },
];

/**
 * Moldura das telas do painel, com menu lateral. Administrador vê tudo; vendedora só Pedidos, Carrinhos e Clientes
 * (e só os dados dela: quem garante isso é o banco). somenteAdmin: telas que a vendedora não abre.
 * Os filhos podem ser uma função para receber o papel (admin/vendedora).
 */
export function Painel({
  titulo, acoes, children, somenteAdmin = false, permitirEditor = false,
}: { titulo: string; acoes?: ReactNode | ((papel: Papel) => ReactNode); children: ReactNode | ((papel: Papel, vendedora: { id: string; nome: string } | null) => ReactNode); somenteAdmin?: boolean; permitirEditor?: boolean }) {
  const caminho = usePathname();
  return (
    <AdminGate somenteAdmin={somenteAdmin} permitirEditor={permitirEditor}>
      {(email, sair, papel, vendedora) => (
        <div className="flex min-h-dvh bg-slate-100 text-slate-900">
          <nav className="sticky top-0 flex h-dvh w-56 shrink-0 flex-col gap-1 bg-marca-escuro p-3 text-sm text-white/80">
            <p className="mb-3 px-2 pt-1 text-base font-bold text-white">{MARCA_CURTA}</p>
            {papel === "editor" && <p className="-mt-2 mb-2 px-2 text-xs text-white/60">Editor de catálogos</p>}
            {papel === "vendedora" && <p className="-mt-2 mb-2 px-2 text-xs text-white/60">Vendedora: {vendedora?.nome}</p>}
            {MENU.filter((m) => (papel === "editor" ? m.editor : papel === "admin" || !m.admin)).map((m) => {
              const ativo = m.href === "/admin" ? caminho === "/admin" : caminho.startsWith(m.href);
              return (
                <Link key={m.href} href={m.href} className={`flex items-center gap-2 rounded-lg px-2 py-2 ${ativo ? "bg-white/15 font-semibold text-white" : "hover:bg-white/10"}`}>
                  <span aria-hidden>{m.icone}</span>
                  {m.rotulo}
                </Link>
              );
            })}
            <div className="mt-auto space-y-1 border-t border-white/10 px-2 pt-3 text-xs">
              <p className="truncate text-white/60">{email}</p>
              <a href="/" target="_blank" rel="noopener" className="block hover:text-white">Ver site ↗</a>
              <button onClick={sair} className="hover:text-white">Sair</button>
            </div>
          </nav>
          <main className="min-w-0 flex-1 p-6">
            <header className="mb-5 flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-bold text-marca">{titulo}</h1>
              <div className="ml-auto flex items-center gap-2">{typeof acoes === "function" ? acoes(papel) : acoes}</div>
            </header>
            {typeof children === "function" ? children(papel, vendedora) : children}
          </main>
        </div>
      )}
    </AdminGate>
  );
}

/** Cartão branco padrão das telas. */
export function Cartao({ titulo, children, className = "" }: { titulo?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl bg-white p-4 shadow-sm ${className}`}>
      {titulo && <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">{titulo}</h2>}
      {children}
    </section>
  );
}

export const dataHora = (s: string) =>
  new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export const tempoAtras = (s: string) => {
  const min = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
};
