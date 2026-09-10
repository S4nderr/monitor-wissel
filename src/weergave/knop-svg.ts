import type { Orientatie, Stand } from "../domein/types.js";

const KLEUR: Record<Stand, string> = { pc: "#2e7d32", werk: "#1565c0", onbekend: "#616161" };
const LABEL: Record<Stand, string> = { pc: "PC", werk: "WERK", onbekend: "?" };

/** Tekengebied van het icoon; Stream Deck schaalt het via de viewBox naar de knop. */
const MAAT = 144;
const MIDDEN = MAAT / 2;

/**
 * Icoon: staand of liggend schermpje in de kleur van de stand, label in het midden.
 * Geen vaste width/height en geen eigen achtergrond: zo schaalt Stream Deck het icoon
 * zelf naar de knop en blijft het exact gecentreerd op de zwarte knopachtergrond.
 */
export function knopSvg(stand: Stand, orientatie: Orientatie): string {
  const breed = orientatie === "liggend" ? 100 : 60;
  const hoog = orientatie === "liggend" ? 60 : 100;
  const x = (MAAT - breed) / 2;
  const y = (MAAT - hoog) / 2;
  // "WERK" is breder dan "PC": in een staand schermpje (60 breed) kleiner zetten.
  const tekstgrootte = stand === "werk" ? (orientatie === "staand" ? 18 : 24) : 32;
  // Geen dominant-baseline (niet elke SVG-renderer kent het): de basislijn zelf
  // onder het midden zetten, ongeveer 35% van de tekstgrootte.
  const tekstY = MIDDEN + Math.round(tekstgrootte * 0.35);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MAAT} ${MAAT}">` +
    `<rect x="${x}" y="${y}" width="${breed}" height="${hoog}" rx="8" fill="${KLEUR[stand]}" stroke="#fff" stroke-width="4"/>` +
    `<text x="${MIDDEN}" y="${tekstY}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="${tekstgrootte}" fill="#fff">${LABEL[stand]}</text>` +
    `</svg>`
  );
}

export function knopDataUrl(stand: Stand, orientatie: Orientatie): string {
  return `data:image/svg+xml,${encodeURIComponent(knopSvg(stand, orientatie))}`;
}
