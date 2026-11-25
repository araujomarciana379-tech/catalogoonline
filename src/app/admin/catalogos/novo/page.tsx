"use client";

import Link from "next/link";
import { useState } from "react";
import { Cartao, Painel } from "@/components/admin/Painel";
import { EscolherPdf, Progresso, ResumoImportacao, importarPdf, type ResultadoImportacao } from "@/components/admin/ImportarPdf";
import { supabase } from "@/lib/supabase";
import { paraSlug, soDigitos } from "@/lib/format";
import { WHATSAPP_PADRAO } from "@/lib/site";


export default function NovoCatalogo() {
  return (
    <Painel somenteAdmin titulo="Novo catálogo" acoes={<Link href="/admin/catalogos" className="text-sm text-slate-600 hover:underline">← Catálogos</Link>}>
      <Formulario />
    </Painel>
  );
}

function Formulario() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEditado, setSlugEditado] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [whatsapp, setWhatsapp] = useState(WHATSAPP_PADRAO);
  const [icones, setIcones] = useState(true);
  const [prog, setProg] = useState<{ texto: string; fracao: number } | null>(null);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState<ResultadoImportacao | null>(null);

  const slugFinal = slugEditado ? slug : paraSlug(nome);
  const ocupado = !!prog && !feito && !erro;

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!arquivo) return setErro("Escolha o PDF do catálogo.");
    if (!nome.trim()) return setErro("Dê um nome ao catálogo.");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slugFinal)) return setErro("Endereço inválido: use letras minúsculas, números e hífen.");
    if (soDigitos(whatsapp).length < 10) return setErro("Informe o WhatsApp que recebe os pedidos.");

    setProg({ texto: "Criando o catálogo…", fracao: 0 });
    const { data: existe } = await supabase.from("catalogos").select("id").eq("slug", slugFinal).maybeSingle();
    if (existe) {
      setProg(null);
      return setErro(`Já existe um catálogo no endereço /c/${slugFinal}. Escolha outro endereço ou substitua o PDF nas configurações dele.`);
    }
    // Começa oculto: só aparece para os clientes depois que você conferir e publicar.
    const { data: cat, error } = await supabase
      .from("catalogos")
      .insert({ slug: slugFinal, nome: nome.trim(), descricao: descricao.trim() || null, whatsapp: soDigitos(whatsapp), mostrar_icones: icones, ativo: false })
      .select("id, slug")
      .single();
    if (error || !cat) {
      setProg(null);
      return setErro(error?.message ?? "Não foi possível criar o catálogo.");
    }
    try {
      const r = await importarPdf(arquivo, cat, "novo", (texto, fracao) => setProg({ texto, fracao }));
      setFeito(r);
    } catch (e) {
      // Desfaz o catálogo pela metade para poder tentar de novo com o mesmo endereço.
      await supabase.from("catalogos").delete().eq("id", cat.id);
      setProg(null);
      setErro(`Não foi possível importar o PDF: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (feito) {
    return (
      <Cartao titulo="Catálogo criado (oculto)">
        <ResumoImportacao r={feito} slug={slugFinal} />
        <p className="mt-4 text-sm text-slate-600">
          Quando estiver tudo certo, publique em{" "}
          <Link href={`/admin/catalogos/${slugFinal}`} className="font-semibold text-marca underline">Configurar</Link>.
        </p>
      </Cartao>
    );
  }

  const campo = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-marca focus:outline-none disabled:bg-slate-50";
  return (
    <form onSubmit={criar} className="grid max-w-5xl gap-4 lg:grid-cols-[1fr_1fr]">
      <Cartao titulo="1. PDF do catálogo">
        <EscolherPdf
          arquivo={arquivo}
          disabled={ocupado}
          onArquivo={(f) => {
            setArquivo(f);
            if (f && !nome) setNome(f.name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim());
          }}
        />
        <p className="mt-2 text-xs text-slate-500">
          Cada página vira uma imagem. Se o PDF tiver o texto dos códigos (ex.: AD.050-4), os carrinhos 🛒 são criados sozinhos em cima
          de cada produto e as fotos recortadas preenchem os produtos que ainda não têm foto. Tudo é processado aqui no seu computador.
        </p>
      </Cartao>

      <Cartao titulo="2. Dados">
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Nome</span>
            <input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} disabled={ocupado} placeholder="Ex.: Coleção São Bento" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Endereço</span>
            <div className="flex items-center gap-1">
              <span className="text-slate-500">/c/</span>
              <input
                className={campo}
                value={slugFinal}
                onChange={(e) => {
                  setSlugEditado(true);
                  setSlug(paraSlug(e.target.value));
                }}
                disabled={ocupado}
              />
            </div>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Descrição (aparece na vitrine)</span>
            <textarea className={campo} rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={ocupado} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">WhatsApp que recebe os pedidos</span>
            <input className={campo} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} disabled={ocupado} inputMode="tel" />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={icones} onChange={(e) => setIcones(e.target.checked)} disabled={ocupado} />
            <span>Mostrar o selo 🛒 nos produtos <span className="text-slate-500">(desmarque se o PDF já tem um ícone de carrinho desenhado)</span></span>
          </label>
        </div>
      </Cartao>

      <div className="space-y-3 lg:col-span-2">
        {erro && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
        {prog && !erro && <Progresso {...prog} />}
        <button type="submit" disabled={ocupado} className="rounded-lg bg-marca px-5 py-2.5 font-semibold text-white hover:bg-marca-hover disabled:opacity-50">
          {ocupado ? "Importando… não feche esta aba" : "Criar catálogo"}
        </button>
      </div>
    </form>
  );
}
