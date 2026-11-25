import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { LOGO_JPEG_BASE64 } from "./logo-pdf";
import { COR_PDF, MARCA, SLOGAN } from "./site";

export type ItemPedido = {
  codigo: string | null;
  quantidade: number;
  nome?: string;
  variacao?: string | null;
  observacao?: string | null;
  descricao: string;
  preco_unitario: number | null;
};

export type PedidoPdf = {
  numero: number;
  criado_em: string;
  cliente_nome: string | null;
  cliente_whatsapp: string | null;
  observacao: string | null;
  catalogo: string;
  total: number | null;
  itens: ItemPedido[];
};

const COR = COR_PDF;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const telefone = (d: string | null) => {
  if (!d) return "—";
  const n = d.replace(/^55(?=\d{10,11}$)/, "");
  return n.length === 11 ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}` : n.length === 10 ? `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}` : d;
};

/** PDF do pedido: Referência | Quantidade | Nome | Santo | Preço unitário. */
export function gerarPedidoPdf(p: PedidoPdf): ArrayBuffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 12;

  // Cabeçalho
  doc.setFillColor(...COR);
  doc.rect(0, 0, W, 30, "F");
  doc.addImage(LOGO_JPEG_BASE64, "JPEG", M, 5, 20, 20);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold").setFontSize(15).text(MARCA, M + 25, 14);
  doc.setFont("helvetica", "italic").setFontSize(9).text(SLOGAN, M + 25, 20);
  doc.setFont("helvetica", "bold").setFontSize(16).text(`PEDIDO #${p.numero}`, W - M, 14, { align: "right" });
  const data = new Date(p.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  doc.setFont("helvetica", "normal").setFontSize(9).text(data, W - M, 20, { align: "right" });

  // Cliente
  doc.setTextColor(30, 30, 30);
  let y = 39;
  const campo = (rotulo: string, valor: string, x: number) => {
    doc.setFont("helvetica", "bold").setFontSize(9).text(rotulo, x, y);
    doc.setFont("helvetica", "normal").text(valor, x + doc.getTextWidth(rotulo) + 2.5, y);
  };
  campo("Cliente:", p.cliente_nome || "—", M);
  campo("WhatsApp:", telefone(p.cliente_whatsapp), W / 2 + 10);
  y += 5.5;
  campo("Catálogo:", p.catalogo, M);
  if (p.observacao) {
    y += 5.5;
    doc.setFont("helvetica", "bold").text("Observações:", M, y);
    const linhas = doc.setFont("helvetica", "normal").splitTextToSize(p.observacao, W - 2 * M - 24);
    doc.text(linhas, M + 24, y);
    y += (linhas.length - 1) * 4;
  }

  // Itens
  const semPreco = p.itens.some((i) => i.preco_unitario == null);
  autoTable(doc, {
    startY: y + 5,
    margin: { left: M, right: M, bottom: 16 },
    head: [["Referência", "Quantidade", "Nome", "Santo", "Preço unitário"]],
    body: p.itens.map((i) => [
      i.codigo ?? "—",
      String(i.quantidade),
      i.nome ?? i.descricao,
      (i.variacao ?? "—") + (i.observacao ? `\n"${i.observacao}"` : ""),
      i.preco_unitario != null ? brl(Number(i.preco_unitario)) : "Sob consulta",
    ]),
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.8, valign: "middle", textColor: [30, 30, 30] },
    headStyles: { fillColor: COR, textColor: 255, fontStyle: "bold", halign: "left" },
    alternateRowStyles: { fillColor: [249, 243, 251] },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 21, halign: "center" },
      2: { cellWidth: "auto" },
      3: { cellWidth: 46 },
      4: { cellWidth: 26, halign: "right" },
    },
  });

  // Totais
  const fim = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let ty = fim + 7;
  if (ty > doc.internal.pageSize.getHeight() - 30) {
    doc.addPage();
    ty = 20;
  }
  const unidades = p.itens.reduce((s, i) => s + i.quantidade, 0);
  doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(60, 60, 60);
  doc.text(`${p.itens.length} ${p.itens.length === 1 ? "item" : "itens"} · ${unidades} unidades`, M, ty);
  const total = p.itens.reduce((s, i) => s + i.quantidade * Number(i.preco_unitario ?? 0), 0);
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(...COR);
  doc.text(semPreco ? `Total parcial: ${brl(total)}` : `Total: ${brl(total)}`, W - M, ty, { align: "right" });
  if (semPreco) {
    doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(110, 110, 110);
    doc.text("Itens sem preço: valor sob consulta.", W - M, ty + 5, { align: "right" });
  }

  // Rodapé com paginação
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    const h = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(130, 130, 130);
    doc.text(`Pedido #${p.numero} · ${MARCA}`, M, h - 8);
    doc.text(`Página ${i} de ${paginas}`, W - M, h - 8, { align: "right" });
  }

  return doc.output("arraybuffer");
}
