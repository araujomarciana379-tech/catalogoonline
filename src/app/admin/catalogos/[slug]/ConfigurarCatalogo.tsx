"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Cartao, Painel } from "@/components/admin/Painel";
import { EscolherPdf, Progresso, ResumoImportacao, importarPdf, type ResultadoImportacao } from "@/components/admin/ImportarPdf";
import { supabase } from "@/lib/supabase";
import { imgUrl, soDigitos } from "@/lib/format";

type Cat = {
  id: string; slug: string; nome: string; descricao: string | null; whatsapp: string; mensagem_inicial: string;
  capa_path: string | null; ativo: boolean; destaque: boolean; ordem: number; mostrar_icones: boolean;
};
type Pag = { numero: number; imagem_path: string };

export function ConfigurarCatalogo({ slug }: { slug: string }) {
  return (
    <Painel somenteAdmin
      titulo="Configurar catálogo"
      acoes={
        <>
          <Link href="/admin/catalogos" className="text-sm text-slate-600 hover:underline">← Catálogos</Link>
          <Link href={`/admin/c/${slug}`} className="rounded-lg bg-marca px-4 py-2 text-sm font-semibold text-white hover:bg-marca-hover">
            Editar carrinhos 🛒
          </Link>
        </>
      }
    >
      <Conteudo slug={slug} />
    </Painel>
  );
}

function Conteudo({ slug }: { slug: string }) {
  const [cat, setCat] = useState<Cat | null>(null);
  const [form, setForm] = useState<Cat | null>(null);
  const [pags, setPags] = useState<Pag[]>([]);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data, error } = await supabase
        .from("catalogos")
        .select("id, slug, nome, descricao, whatsapp, mensagem_inicial, capa_path, ativo, destaque, ordem, mostrar_icones")
        .eq("slug", slug)
        .maybeSingle();
      if (!vivo) return;
      if (error || !data) return setErro(error?.message ?? "Catálogo não encontrado.");
      setCat(data as Cat);
      setForm(data as Cat);
      const { data: ps } = await supabase.from("paginas").select("numero, imagem_path").eq("catalogo_id", data.id).order("numero");
      if (vivo) setPags((ps ?? []) as Pag[]);
    })();
    return () => {
      vivo = false;
    };
  }, [slug, recarga]);

  if (erro) return <p className="text-red-600">{erro}</p>;
  if (!cat || !form) return <p className="text-slate-500">Carregando…</p>;

  const mudou = JSON.stringify(cat) !== JSON.stringify(form);
  const set = <K extends keyof Cat>(k: K, v: Cat[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  async function salvar() {
    if (!form || !cat) return;
    setMsg("");
    if (!form.nome.trim()) return setMsg("✖ O nome não pode ficar vazio.");
    if (soDigitos(form.whatsapp).length < 10) return setMsg("✖ WhatsApp inválido.");
    setSalvando(true);
    const { id } = form;
    const { error } = await supabase
      .from("catalogos")
      .update({
        nome: form.nome.trim(),
        descricao: form.descricao?.trim() || null,
        whatsapp: soDigitos(form.whatsapp),
        mensagem_inicial: form.mensagem_inicial,
        capa_path: form.capa_path,
        ativo: form.ativo,
        destaque: form.destaque,
        ordem: form.ordem,
        mostrar_icones: form.mostrar_icones,
      })
      .eq("id", id);
    // Só um catálogo fica em destaque na vitrine.
    if (!error && form.destaque && !cat.destaque) await supabase.from("catalogos").update({ destaque: false }).neq("id", id).eq("destaque", true);
    setSalvando(false);
    if (error) return setMsg(`✖ ${error.message}`);
    setCat(form);
    setMsg("✔ Salvo");
  }

  async function enviarCapa(f: File) {
    if (!form) return;
    const ext = (f.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const caminho = `${form.slug}/capa-${Date.now().toString(36)}.${ext}`;
    const { error } = await supabase.storage.from("catalogo").upload(caminho, f, { contentType: f.type || "image/jpeg", cacheControl: "31536000" });
    if (error) return setMsg(`✖ Falha ao enviar a capa: ${error.message}`);
    set("capa_path", caminho);
  }

  const campo = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca focus:outline-none";
  return (
    <div className="grid max-w-6xl gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Cartao titulo="Dados">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Nome</span>
              <input className={campo} value={form.nome} onChange={(e) => set("nome", e.target.value)} />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Descrição (vitrine)</span>
              <textarea className={campo} rows={2} value={form.descricao ?? ""} onChange={(e) => set("descricao", e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">WhatsApp que recebe os pedidos</span>
              <input className={campo} value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} inputMode="tel" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Ordem na vitrine <span className="font-normal text-slate-500">(menor primeiro)</span></span>
              <input className={campo} type="number" value={form.ordem} onChange={(e) => set("ordem", Number(e.target.value) || 0)} />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Mensagem inicial do pedido no WhatsApp</span>
              <input className={campo} value={form.mensagem_inicial} onChange={(e) => set("mensagem_inicial", e.target.value)} />
            </label>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <Interruptor ligado={form.ativo} onChange={(v) => set("ativo", v)} rotulo="Publicado" ajuda="Aparece na vitrine e o link /c/ funciona para os clientes." />
            <Interruptor ligado={form.destaque} onChange={(v) => set("destaque", v)} rotulo="Destaque" ajuda="Fica em evidência no topo da vitrine (só um catálogo por vez)." />
            <Interruptor ligado={form.mostrar_icones} onChange={(v) => set("mostrar_icones", v)} rotulo="Mostrar selo 🛒" ajuda="Desligue se o PDF já tem o ícone de carrinho desenhado." />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={salvar} disabled={!mudou || salvando} className="rounded-lg bg-marca px-5 py-2 font-semibold text-white hover:bg-marca-hover disabled:opacity-40">
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            {mudou && <button onClick={() => setForm(cat)} className="text-sm text-slate-600 hover:underline">Descartar alterações</button>}
            {msg && <span className={`text-sm ${msg.startsWith("✖") ? "text-red-600" : "text-emerald-700"}`}>{msg}</span>}
          </div>
        </Cartao>

        <AcaoPdf cat={cat} modo="religar" onFeito={() => setRecarga((n) => n + 1)} />
        <AcaoPdf cat={cat} modo="substituir" onFeito={() => setRecarga((n) => n + 1)} />
        <Excluir cat={cat} />
      </div>

      <Cartao titulo="Capa">
        <div className="mx-auto aspect-[3/4] w-48 overflow-hidden rounded-lg bg-slate-100 shadow">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {form.capa_path && <img src={imgUrl(form.capa_path)} alt="Capa" className="h-full w-full object-cover" />}
        </div>
        <p className="mt-3 text-xs font-medium text-slate-500">Usar uma página como capa:</p>
        <div className="mt-1 grid max-h-64 grid-cols-4 gap-1.5 overflow-y-auto">
          {pags.map((p) => (
            <button
              key={p.numero}
              onClick={() => set("capa_path", p.imagem_path)}
              title={`Página ${p.numero}`}
              className={`aspect-[3/4] overflow-hidden rounded border-2 ${form.capa_path === p.imagem_path ? "border-marca" : "border-transparent hover:border-slate-300"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgUrl(p.imagem_path)} alt={`Página ${p.numero}`} loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
        <label className="mt-3 block cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-center text-sm font-medium hover:bg-slate-50">
          Enviar outra imagem…
          <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && void enviarCapa(e.target.files[0])} />
        </label>
        <p className="mt-1 text-center text-xs text-slate-500">Depois de escolher, clique em Salvar.</p>
      </Cartao>
    </div>
  );
}

function Interruptor({ ligado, onChange, rotulo, ajuda }: { ligado: boolean; onChange: (v: boolean) => void; rotulo: string; ajuda: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        onClick={() => onChange(!ligado)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${ligado ? "bg-marca" : "bg-slate-300"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${ligado ? "left-[18px]" : "left-0.5"}`} />
      </button>
      <span>
        <span className="font-medium">{rotulo}</span> <span className="text-slate-500">— {ajuda}</span>
      </span>
    </label>
  );
}

type ModoPdf = "substituir" | "religar";
const TEXTOS: Record<ModoPdf, { titulo: string; texto: string; botao: string; confirmar: string }> = {
  substituir: {
    titulo: "Substituir PDF",
    texto:
      "Use quando o catálogo for atualizado (preços na arte, páginas novas). As páginas são trocadas; se o PDF novo tiver menos páginas, as que sobrarem são removidas junto com os carrinhos delas.",
    botao: "Substituir páginas",
    confirmar: "Trocar as imagens das páginas por este PDF? Os carrinhos já posicionados continuam onde estão (confira no editor se o layout mudou).",
  },
  religar: {
    titulo: "Religar produtos pelo PDF",
    texto:
      "Use quando os carrinhos continuam nas páginas mas perderam o produto. Envie o MESMO PDF deste catálogo: o sistema relê os códigos e coloca o produto em cada carrinho que está na mesma posição. Nada é apagado nem duplicado; só carrinhos sem produto são preenchidos e os que faltarem são criados. Só funciona com PDF que tenha os códigos como texto.",
    botao: "Religar produtos",
    confirmar: "Religar os produtos deste catálogo a partir do PDF? Os carrinhos que já têm produto não são alterados.",
  },
};

function AcaoPdf({ cat, modo, onFeito }: { cat: Cat; modo: ModoPdf; onFeito: () => void }) {
  const t = TEXTOS[modo];
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [prog, setProg] = useState<{ texto: string; fracao: number } | null>(null);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState<ResultadoImportacao | null>(null);
  const ocupado = !!prog && !feito && !erro;

  async function enviar() {
    if (!arquivo) return;
    if (!confirm(t.confirmar)) return;
    setErro("");
    setFeito(null);
    try {
      const r = await importarPdf(arquivo, cat, modo, (texto, fracao) => setProg({ texto, fracao }));
      setFeito(r);
      onFeito();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Cartao titulo={t.titulo}>
      <p className="mb-3 text-sm text-slate-600">{t.texto}</p>
      <EscolherPdf arquivo={arquivo} onArquivo={setArquivo} disabled={ocupado} />
      <div className="mt-3 space-y-3">
        {erro && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
        {prog && !erro && !feito && <Progresso {...prog} />}
        {feito && <ResumoImportacao r={feito} slug={cat.slug} />}
        {!feito && (
          <button onClick={enviar} disabled={!arquivo || ocupado} className="rounded-lg border border-marca px-4 py-2 text-sm font-semibold text-marca hover:bg-blue-50 disabled:opacity-40">
            {ocupado ? "Processando… não feche esta aba" : t.botao}
          </button>
        )}
      </div>
    </Cartao>
  );
}

function Excluir({ cat }: { cat: Cat }) {
  const router = useRouter();
  const [erro, setErro] = useState("");
  async function excluir() {
    const resp = prompt(`Excluir o catálogo "${cat.nome}"? Serão apagadas as páginas e os carrinhos (áreas de compra) deste catálogo. Os produtos e preços NÃO são apagados. Isso não pode ser desfeito.\n\nDigite o endereço (${cat.slug}) para confirmar:`);
    if (resp?.trim() !== cat.slug) return;
    const { error } = await supabase.from("catalogos").delete().eq("id", cat.id);
    if (error) {
      // Pedidos guardam o catálogo de origem: com pedidos, o certo é só ocultar.
      setErro(/foreign key|violates/i.test(error.message) ? "Este catálogo já tem pedidos e não pode ser excluído. Desligue \"Publicado\" para ocultá-lo." : error.message);
      return;
    }
    router.push("/admin/catalogos");
  }
  return (
    <Cartao titulo="Zona de perigo">
      <button onClick={excluir} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Excluir catálogo</button>
      {erro && <p className="mt-2 text-sm text-red-700">{erro}</p>}
    </Cartao>
  );
}
