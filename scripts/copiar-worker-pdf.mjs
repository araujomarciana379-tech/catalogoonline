// Copia para /public o que o pdf.js precisa no navegador (a importação de PDF no painel roda lá):
// o worker, os decodificadores de imagem (JPEG2000, JBIG2, perfis de cor), mapas de caracteres e fontes padrão.
// Sem os decodificadores, PDFs com imagens nesses formatos saem em branco.
import { cpSync, copyFileSync, existsSync, mkdirSync } from "node:fs";

const pdfjs = "node_modules/pdfjs-dist";
if (existsSync(pdfjs)) {
  copyFileSync(`${pdfjs}/legacy/build/pdf.worker.min.mjs`, "public/pdf.worker.min.mjs");
  mkdirSync("public/pdfjs", { recursive: true });
  for (const pasta of ["wasm", "iccs", "cmaps", "standard_fonts"]) {
    if (existsSync(`${pdfjs}/${pasta}`)) cpSync(`${pdfjs}/${pasta}`, `public/pdfjs/${pasta}`, { recursive: true });
  }
}
