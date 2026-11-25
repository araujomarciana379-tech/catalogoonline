"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listarCatalogos } from "@/lib/catalogo-data";
import { imgUrl } from "@/lib/format";
import type { CatalogoResumo } from "@/lib/types";
import { MARCA, SITE_INSTITUCIONAL, SLOGAN, WHATSAPP_PADRAO } from "@/lib/site";

/** Capa do catálogo: ao passar o mouse (ou focar) dá zoom e mostra "Ver produtos"; no celular a etiqueta fica sempre visível. */
function Capa({ c, className = "" }: { c: CatalogoResumo; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-creme ${className}`}>
      {c.capa_path ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgUrl(c.capa_path)}
          alt={`Capa: ${c.nome}`}
          className="aspect-[595/842] w-full scale-[1.02] object-cover transition-transform duration-500 ease-out group-hover:scale-110 group-focus-visible:scale-110"
        />
      ) : (
        <div className="flex aspect-[595/842] w-full items-center justify-center bg-gradient-to-br from-marca to-marca-escuro p-4 text-center font-titulo text-lg text-white transition-transform duration-500 ease-out group-hover:scale-110 group-focus-visible:scale-110">
          {c.nome}
        </div>
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center bg-gradient-to-t from-marca-noite/85 via-marca-noite/30 to-transparent px-3 pb-4 pt-20 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
        <span className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-marca shadow-lg">Ver produtos →</span>
      </span>
    </div>
  );
}

/** Flor do logo, usada como marca d'água decorativa. */
function Flor({ className = "" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/icons/flor.png" alt="" aria-hidden className={`pointer-events-none select-none ${className}`} />;
}

const PASSOS = [
  { n: "1", titulo: "Folheie o catálogo", texto: "Passe as páginas como numa revista, no celular ou no computador." },
  { n: "2", titulo: "Toque no carrinho 🛒", texto: "Escolha o modelo e a quantidade de cada produto que quiser." },
  { n: "3", titulo: "Envie pelo WhatsApp", texto: "Seu pedido chega pronto para nós, com um PDF de todos os itens." },
];

export function Vitrine() {
  const [lista, setLista] = useState<CatalogoResumo[] | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    listarCatalogos()
      .then(setLista)
      .catch((e) => {
        console.error("Falha ao listar catálogos", e);
        setErro(true);
      });
  }, []);

  const [principal, ...outros] = lista ?? [];
  const contato = `https://wa.me/${WHATSAPP_PADRAO}?text=${encodeURIComponent(`Olá! Vim pelo catálogo online da ${MARCA}.`)}`;

  return (
    <main className="min-h-dvh bg-white text-texto">
      {/* Barra da marca */}
      <header className="sticky top-0 z-20 border-b border-marca/10 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" aria-label={MARCA}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/logo-horizontal.png" alt={MARCA} className="h-11 w-auto sm:h-14" />
          </Link>
          <a
            href={contato}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-full border border-marca/30 px-4 py-2 text-sm font-medium text-marca transition hover:bg-marca hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.4 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.7-.1 1.3Z" />
            </svg>
            <span className="hidden sm:inline">Fale conosco</span>
            <span className="sm:hidden">Contato</span>
          </a>
        </div>
      </header>

      {/* Destaque */}
      <section className="relative overflow-hidden bg-gradient-to-br from-creme via-white to-destaque/40">
        <Flor className="absolute -right-24 -top-16 w-[28rem] opacity-[0.07] sm:-right-10 sm:w-[36rem]" />
        <Flor className="absolute -bottom-24 -left-20 w-72 rotate-12 opacity-[0.05]" />

        {erro && <p className="relative p-10 text-center text-marca">Não foi possível carregar os catálogos. Tente novamente.</p>}
        {!lista && !erro && <p className="relative p-10 text-center text-marca/70">Carregando catálogos…</p>}
        {lista && lista.length === 0 && <p className="relative p-10 text-center text-marca/70">Nenhum catálogo publicado ainda.</p>}

        {principal && (
          <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:grid-cols-[minmax(0,340px)_1fr] sm:gap-14 sm:py-16">
            <Link href={`/c/${principal.slug}`} className="group mx-auto block w-full max-w-[300px] focus-visible:outline-none sm:max-w-[340px]">
              <Capa c={principal} className="rounded-xl shadow-2xl shadow-marca/30 ring-1 ring-marca/10" />
            </Link>
            <div className="text-center sm:text-left">
              <span className="inline-block rounded-full bg-destaque/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-marca-escuro">
                Catálogo em destaque
              </span>
              <h1 className="mt-4 font-titulo text-3xl leading-tight text-marca-escuro sm:text-5xl">{principal.nome}</h1>
              {principal.descricao && <p className="mt-4 text-base text-texto/80 sm:text-lg">{principal.descricao}</p>}
              <p className="mt-3 text-sm text-texto/70">Toque nos produtos para montar seu pedido e envie direto pelo WhatsApp.</p>
              <div className="mt-7 flex flex-wrap justify-center gap-3 sm:justify-start">
                <Link
                  href={`/c/${principal.slug}`}
                  className="inline-flex items-center gap-2 rounded-full bg-marca px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-marca/30 transition hover:-translate-y-0.5 hover:bg-marca-hover"
                >
                  Abrir catálogo <span aria-hidden>→</span>
                </Link>
                <a href="#como-comprar" className="inline-flex items-center rounded-full border border-marca/30 bg-white/70 px-6 py-3.5 text-sm font-semibold text-marca transition hover:bg-white">
                  Como comprar
                </a>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Outros catálogos */}
      {outros.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <div className="mb-10 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-marca/70">Nossos catálogos</p>
            <h2 className="mt-2 font-titulo text-2xl text-marca-escuro sm:text-4xl">Conheça também nossos lançamentos</h2>
            <div className="mx-auto mt-4 h-1 w-16 rounded-full bg-destaque" />
          </div>
          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-8 sm:gap-x-7">
            {outros.map((c) => (
              <li key={c.slug} className="w-[calc(50%-0.625rem)] sm:w-[calc(33.333%-1.17rem)] lg:w-[calc(25%-1.32rem)]">
                <Link href={`/c/${c.slug}`} className="group block rounded-2xl p-2 transition hover:bg-creme focus-visible:outline-none">
                  <Capa c={c} className="rounded-xl shadow-lg shadow-marca/15 ring-1 ring-marca/10" />
                  <p className="mt-3 text-center text-sm font-semibold text-marca-escuro sm:text-base">{c.nome}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Como comprar */}
      <section id="como-comprar" className="scroll-mt-20 bg-creme">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
          <h2 className="text-center font-titulo text-2xl text-marca-escuro sm:text-3xl">Como comprar</h2>
          <ol className="mt-10 grid gap-5 sm:grid-cols-3">
            {PASSOS.map((p) => (
              <li key={p.n} className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-marca/10">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-marca font-titulo text-lg text-white">{p.n}</span>
                <p className="mt-4 font-semibold text-marca-escuro">{p.titulo}</p>
                <p className="mt-1 text-sm text-texto/75">{p.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Rodapé */}
      <footer className="bg-marca-escuro text-marca-suave">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-10 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/logo-horizontal-branco.png" alt={MARCA} className="h-12 w-auto opacity-95" />
          <p className="font-titulo text-lg text-white">{SLOGAN}</p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            <a href={contato} target="_blank" rel="noopener" className="hover:text-white">WhatsApp</a>
            <a href={SITE_INSTITUCIONAL} target="_blank" rel="noopener" className="hover:text-white">Nosso site</a>
          </div>
          <p className="text-xs text-marca-suave/70">© {MARCA}</p>
        </div>
      </footer>
    </main>
  );
}
