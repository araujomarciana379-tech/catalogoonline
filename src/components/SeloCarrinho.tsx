/**
 * Selo 🛒 no canto superior direito de uma área clicável. É o mesmo desenho na página do cliente e no editor,
 * para a administradora ver no editor exatamente onde o botão vai aparecer. O pai precisa ser `relative`/`absolute`.
 * Tamanho e deslocamento acompanham a largura da página (unidades `cqw` do container da página), com limites:
 * assim a posição relativa é a mesma no editor, no computador e no celular.
 */
const LADO = "clamp(1.75rem, 6cqw, 2.25rem)";
const FORA = "calc(-1 * max(0.4rem, 1.5cqw))";

export function SeloCarrinho({ pulsar = false, estado = "ok", interativo = false }: { pulsar?: boolean; estado?: "ok" | "sem-produto"; interativo?: boolean }) {
  return (
    <span
      aria-hidden
      style={{ width: LADO, height: LADO, right: FORA, top: FORA, fontSize: "clamp(0.8rem, 2.8cqw, 1.05rem)" }}
      className={`${interativo ? "cursor-move" : "pointer-events-none"} absolute flex items-center justify-center rounded-full shadow-lg ring-2 ring-white group-focus-visible:ring-4 group-focus-visible:ring-amber-400 ${
        estado === "sem-produto" ? "bg-red-600" : "bg-marca"
      } ${pulsar ? "motion-safe:animate-pulse" : ""}`}
    >
      🛒
    </span>
  );
}
