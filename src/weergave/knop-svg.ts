import type { Orientatie, Stand } from "../domein/types.js";

const KLEUR: Record<Stand, string> = { pc: "#2e7d32", werk: "#1565c0", onbekend: "#616161" };
const LABEL: Record<Stand, string> = { pc: "PC", werk: "WERK", onbekend: "?" };

/** 144×144 SVG: staand of liggend schermpje in de kleur van de stand, label in het midden. */
export function knopSvg(stand: Stand, orientatie: Orientatie): string {
  const breed = orientatie === "liggend" ? 96 : 56;
  const hoog = orientatie === "liggend" ? 56 : 96;
  const x = (144 - breed) / 2;
  const y = (144 - hoog) / 2;
  const tekstgrootte = stand === "werk" ? 22 : 30;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144" width="144" height="144">` +
    `<rect width="144" height="144" rx="16" fill="#000"/>` +
    `<rect x="${x}" y="${y}" width="${breed}" height="${hoog}" rx="6" fill="${KLEUR[stand]}" stroke="#fff" stroke-width="4"/>` +
    `<text x="72" y="72" text-anchor="middle" dominant-baseline="central" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="${tekstgrootte}" fill="#fff">${LABEL[stand]}</text>` +
    `</svg>`
  );
}

export function knopDataUrl(stand: Stand, orientatie: Orientatie): string {
  return `data:image/svg+xml,${encodeURIComponent(knopSvg(stand, orientatie))}`;
}
