import type { MetadataRoute } from "next";
import { COR_TEMA, MARCA, MARCA_CURTA, SLOGAN } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${MARCA} – Catálogos`,
    short_name: MARCA_CURTA,
    description: `Catálogos da ${MARCA}. ${SLOGAN}`,
    lang: "pt-BR",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: COR_TEMA,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
