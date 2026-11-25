import streamDeck from "@elgato/streamdeck";
import os from "node:os";
import path from "node:path";
import { Slate } from "./engine";
import { SlateServer } from "./server";
import indexHtml from "./web/index.html";
import faviconSvg from "./web/favicon.svg";

/**
 * Le dessin est rangé hors du dossier du plugin : avec la protection DRM d'Elgato,
 * les fichiers distribués ne doivent pas être modifiés.
 */
function dataDir(): string {
	if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Retro Slate");
	if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Retro Slate");
	return path.join(os.homedir(), ".retro-slate");
}

const TEXT = {
	fr: {
		h: "Horizontale",
		v: "Verticale",
		speeds: ["Fin", "Normal", "Rapide"],
		rotate: "Tracer",
		push: "Vitesse",
		touch: "Secouer",
		longTouch: "Tout effacer",
		folder: "Ardoise rétro"
	},
	en: {
		h: "Horizontal",
		v: "Vertical",
		speeds: ["Fine", "Normal", "Fast"],
		rotate: "Draw",
		push: "Speed",
		touch: "Shake",
		longTouch: "Erase all",
		folder: "Retro Slate"
	}
};

export function lang(): "fr" | "en" {
	const l = String(streamDeck.info?.application?.language ?? "en");
	return l.startsWith("fr") ? "fr" : "en";
}

export function t() {
	return TEXT[lang()];
}

export const slate = new Slate(path.join(dataDir(), "drawing.json"));

export const server = new SlateServer(
	slate,
	{
		"/index.html": { type: "text/html; charset=utf-8", body: indexHtml },
		"/favicon.svg": { type: "image/svg+xml", body: faviconSvg }
	},
	{
		lang,
		photoFolder: () => path.join(os.homedir(), "Pictures", t().folder)
	}
);

let lastAutoOpen = 0;

/** Ouvre la fenêtre de l'ardoise sur l'ordinateur. */
export async function openSlate(): Promise<void> {
	if (!server.port) return;
	lastAutoOpen = Date.now();
	await streamDeck.system.openUrl(server.url);
}

/** Si personne ne regarde l'ardoise quand on tourne un bouton, on l'ouvre (au plus toutes les 20 s). */
export function autoOpen(): void {
	if (server.clients.size > 0 || !server.port) return;
	if (Date.now() - lastAutoOpen < 20000) return;
	void openSlate();
}

/** Limite la fréquence d'une fonction (dernier appel garanti). */
export function throttle(fn: () => void, ms: number): () => void {
	let timer: NodeJS.Timeout | undefined;
	let last = 0;
	return () => {
		if (timer) return;
		const wait = Math.max(0, last + ms - Date.now());
		timer = setTimeout(() => {
			timer = undefined;
			last = Date.now();
			fn();
		}, wait);
	};
}

/** Image SVG pour setImage / setFeedback, sous la forme documentée par Elgato. */
export const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf8,${svg}`;
