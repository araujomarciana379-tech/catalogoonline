import { gerarPedidoPdf, type PedidoPdf } from "@/lib/pedido-pdf";
import { MARCA_CURTA } from "@/lib/site";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PDF do pedido. O token vai no link enviado pelo WhatsApp; sem ele o pedido não abre.
export async function GET(req: Request, ctx: RouteContext<"/pedido/[id]/pdf">) {
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!UUID.test(id) || !UUID.test(token)) return new Response("Pedido não encontrado", { status: 404 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  let pedido: PedidoPdf | null;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/pedido_publico`, {
      method: "POST",
      headers: { apikey: chave, Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_id: id, p_token: token }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    pedido = (await r.json()) as PedidoPdf | null;
  } catch (e) {
    console.error("PDF do pedido: falha ao ler o pedido", e);
    return new Response("Não foi possível carregar o pedido. Tente de novo em instantes.", { status: 502 });
  }
  if (!pedido) return new Response("Pedido não encontrado", { status: 404 });

  return new Response(gerarPedidoPdf(pedido), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Pedido-${pedido.numero}-${MARCA_CURTA}.pdf"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
