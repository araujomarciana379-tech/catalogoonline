"use client";

import { useCallback, useEffect, useState } from "react";
import { Cartao, Painel } from "@/components/admin/Painel";
import { supabase } from "@/lib/supabase";
import { maskTelefone, paraSlug, soDigitos } from "@/lib/format";

type Vendedora = {
  id: string; nome: string; slug: string; whatsapp: string; ativo: boolean; user_id: string | null; convite: string | null;
  clientes: { count: number }[]; pedidos: { count: number }[];
};
type CatalogoOpcao = { slug: string; nome: string };

export default function Vendedoras() {
  return (
    <Painel titulo="Vendedoras" somenteAdmin>
      <Conteudo />
    </Painel>
  );
}

function Conteudo() {
  const [lista, setLista] = useState<Vendedora[] | null>(null);
  const [catalogos, setCatalogos] = useState<CatalogoOpcao[]>([]);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const [v, c] = await Promise.all([
      supabase.from("vendedoras").select("id, nome, slug, whatsapp, ativo, user_id, convite, clientes(count), pedidos(count)").order("nome"),
      supabase.from("catalogos").select("slug, nome").eq("ativo", true).order("ordem"),
    ]);
    if (v.error) return setErro(v.error.message);
    setLista((v.data ?? []) as unknown as Vendedora[]);
    setCatalogos((c.data ?? []) as CatalogoOpcao[]);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, [carregar]);

  if (erro) return <p className="text-red-600">Erro: {erro}</p>;
  return (
    <div className="space-y-4">
      <Nova onCriada={carregar} />
      <p className="text-sm text-slate-600">
        Cada vendedora tem um link. Quem entra por ele fica ligado a ela e, ao finalizar, o pedido vai para o WhatsApp dela. Vale o último link que o
        cliente usou, a não ser que você troque a vendedora do cliente manualmente em <strong>Clientes</strong>.
      </p>
      {!lista ? (
        <p className="text-slate-500">Carregando…</p>
      ) : lista.length === 0 ? (
        <Cartao><p className="py-4 text-center text-slate-500">Nenhuma vendedora cadastrada ainda.</p></Cartao>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {lista.map((v) => <Cartaozinho key={v.id} v={v} catalogos={catalogos} onMudou={carregar} />)}
        </div>
      )}
    </div>
  );
}

function Nova({ onCriada }: { onCriada: () => void }) {
  const [nome, setNome] = useState("");
  const [zap, setZap] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEditado, setSlugEditado] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const codigo = slugEditado ? slug : paraSlug(nome).split("-")[0];

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const d = soDigitos(zap).replace(/^55(?=\d{10,11}$)/, "");
    if (!nome.trim()) return setErro("Informe o nome.");
    if (d.length < 10 || d.length > 11) return setErro("WhatsApp inválido: use DDD + número.");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(codigo)) return setErro("O código do link deve ter só letras minúsculas, números e hífen.");
    setSalvando(true);
    const { error } = await supabase.from("vendedoras").insert({ nome: nome.trim(), whatsapp: d, slug: codigo });
    setSalvando(false);
    if (error) return setErro(/duplicate|unique/i.test(error.message) ? `Já existe uma vendedora com o código "${codigo}".` : error.message);
    setNome("");
    setZap("");
    setSlug("");
    setSlugEditado(false);
    onCriada();
  }

  const campo = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca focus:outline-none";
  return (
    <Cartao titulo="Nova vendedora">
      <form onSubmit={criar} className="grid gap-3 sm:grid-cols-[1fr_1fr_160px_auto] sm:items-end">
        <label className="text-sm"><span className="mb-1 block font-medium">Nome</span><input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} /></label>
        <label className="text-sm"><span className="mb-1 block font-medium">WhatsApp que recebe os pedidos</span><input className={campo} value={zap} onChange={(e) => setZap(maskTelefone(e.target.value))} inputMode="tel" placeholder="(43) 99999-9999" /></label>
        <label className="text-sm"><span className="mb-1 block font-medium">Código do link</span><input className={campo} value={codigo} onChange={(e) => { setSlugEditado(true); setSlug(paraSlug(e.target.value)); }} /></label>
        <button disabled={salvando} className="rounded-lg bg-marca px-4 py-2 text-sm font-semibold text-white hover:bg-marca-hover disabled:opacity-50">Cadastrar</button>
      </form>
      {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
    </Cartao>
  );
}

function Cartaozinho({ v, catalogos, onMudou }: { v: Vendedora; catalogos: CatalogoOpcao[]; onMudou: () => void }) {
  const [catalogo, setCatalogo] = useState("");
  const [copiado, setCopiado] = useState("");
  const [msg, setMsg] = useState("");
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(v.nome);
  const [zap, setZap] = useState(maskTelefone(v.whatsapp));

  const origem = typeof window === "undefined" ? "" : window.location.origin;
  const link = `${origem}${catalogo ? `/c/${catalogo}` : "/"}?v=${v.slug}`;
  const conviteLink = v.convite ? `${origem}/admin/convite?c=${v.convite}` : "";

  async function copiar(texto: string, qual: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(qual);
      setTimeout(() => setCopiado(""), 1800);
    } catch {
      setMsg("Não consegui copiar; selecione o link e copie à mão.");
    }
  }
  async function atualizar(campos: Record<string, unknown>) {
    setMsg("");
    const { error } = await supabase.from("vendedoras").update(campos).eq("id", v.id);
    if (error) return setMsg(error.message);
    onMudou();
  }
  async function salvarDados() {
    const d = soDigitos(zap).replace(/^55(?=\d{10,11}$)/, "");
    if (!nome.trim() || d.length < 10 || d.length > 11) return setMsg("Confira o nome e o WhatsApp (DDD + número).");
    await atualizar({ nome: nome.trim(), whatsapp: d });
    setEditando(false);
  }
  async function redefinirAcesso() {
    if (!confirm(`Redefinir o acesso de ${v.nome}? Ela perde o login atual e precisará do novo convite.`)) return;
    await atualizar({ user_id: null, convite: crypto.randomUUID() });
  }

  return (
    <Cartao>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {editando ? (
            <div className="space-y-1.5">
              <input value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome" className="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
              <input value={zap} onChange={(e) => setZap(maskTelefone(e.target.value))} aria-label="WhatsApp" inputMode="tel" className="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
              <div className="space-x-3 text-sm">
                <button onClick={() => void salvarDados()} className="font-semibold text-marca underline">salvar</button>
                <button onClick={() => { setEditando(false); setNome(v.nome); setZap(maskTelefone(v.whatsapp)); }} className="text-slate-500 underline">cancelar</button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-lg font-semibold">{v.nome} {!v.ativo && <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 align-middle text-xs font-semibold text-slate-600">inativa</span>}</p>
              <p className="text-sm text-slate-600">WhatsApp {maskTelefone(v.whatsapp)} · <button onClick={() => setEditando(true)} className="underline">editar</button></p>
              <p className="text-xs text-slate-500">{v.clientes?.[0]?.count ?? 0} cliente(s) · {v.pedidos?.[0]?.count ?? 0} pedido(s)</p>
            </>
          )}
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm">
          <input type="checkbox" checked={v.ativo} onChange={(e) => void atualizar({ ativo: e.target.checked })} />
          Ativa
        </label>
      </div>

      <div className="mt-3 space-y-1.5 text-sm">
        <p className="font-medium">Link da vendedora</p>
        <div className="flex flex-wrap gap-2">
          <select value={catalogo} onChange={(e) => setCatalogo(e.target.value)} aria-label="Catálogo do link" className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
            <option value="">Página inicial (todos os catálogos)</option>
            {catalogos.map((c) => <option key={c.slug} value={c.slug}>{c.nome}</option>)}
          </select>
          <button onClick={() => void copiar(link, "link")} className="rounded-lg bg-marca px-3 py-1.5 text-sm font-semibold text-white">{copiado === "link" ? "Copiado ✓" : "Copiar link"}</button>
        </div>
        <p className="break-all rounded bg-slate-50 px-2 py-1 font-mono text-xs text-slate-600">{link}</p>
      </div>

      <div className="mt-3 border-t pt-3 text-sm">
        <p className="font-medium">Acesso ao painel</p>
        {v.user_id ? (
          <p className="text-emerald-700">✓ Conta ligada. Ela entra em {origem}/admin e vê só os clientes dela. <button onClick={() => void redefinirAcesso()} className="ml-1 text-slate-500 underline">redefinir acesso</button></p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-amber-700">Convite pendente: envie este link para ela criar a conta e entrar.</p>
            {conviteLink ? (
              <>
                <p className="break-all rounded bg-slate-50 px-2 py-1 font-mono text-xs text-slate-600">{conviteLink}</p>
                <button onClick={() => void copiar(conviteLink, "convite")} className="rounded-lg border border-marca px-3 py-1.5 text-sm font-semibold text-marca">{copiado === "convite" ? "Copiado ✓" : "Copiar convite"}</button>
              </>
            ) : (
              <button onClick={() => void atualizar({ convite: crypto.randomUUID() })} className="rounded-lg border border-marca px-3 py-1.5 text-sm font-semibold text-marca">Gerar convite</button>
            )}
          </div>
        )}
      </div>
      {msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}
    </Cartao>
  );
}
