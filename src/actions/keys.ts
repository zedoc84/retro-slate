import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	KeyUpEvent,
	SendToPluginEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { autoOpen, openSlate, server, slate, svgUrl, throttle } from "../app";

type Dir = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
type ArrowSettings = { dir?: Dir; speed?: "slow" | "normal" | "fast" };

const VECTORS: Record<Dir, [number, number]> = {
	n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1],
	s: [0, 1], sw: [-1, 1], w: [-1, 0], nw: [-1, -1]
};
const ANGLES: Record<Dir, number> = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };
const BASE = { slow: 0.6, normal: 1.6, fast: 3.4 };

/** Commandes communes aux touches : bouton « Ouvrir l'ardoise » de l'inspecteur. */
async function piCommand(payload: JsonValue) {
	const p = payload as { cmd?: string } | null;
	if (p?.cmd === "open") await openSlate();
}

/**
 * Flèche : maintenir la touche trace dans une direction (8 au choix), avec accélération.
 * Pour les Stream Deck sans molette (MK.2, XL, Mini, Neo, Mobile…).
 */
@action({ UUID: "com.medilase.retro-slate.arrow" })
export class ArrowAction extends SingletonAction<ArrowSettings> {
	#loops = new Map<string, NodeJS.Timeout>();

	override async onWillAppear(ev: WillAppearEvent<ArrowSettings>): Promise<void> {
		if (ev.action.isKey()) await ev.action.setImage(svgUrl(arrowSvg(ev.payload.settings.dir ?? "e")));
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ArrowSettings>): Promise<void> {
		if (ev.action.isKey()) await ev.action.setImage(svgUrl(arrowSvg(ev.payload.settings.dir ?? "e")));
	}

	override onKeyDown(ev: KeyDownEvent<ArrowSettings>): void {
		const [vx, vy] = VECTORS[ev.payload.settings.dir ?? "e"] ?? VECTORS.e;
		const norm = vx && vy ? Math.SQRT1_2 : 1;
		const base = BASE[ev.payload.settings.speed ?? "normal"] ?? BASE.normal;
		this.#stop(ev.action.id);
		slate.move(vx * norm, vy * norm); // un petit pas tout de suite, pour les retouches fines
		const t0 = Date.now();
		this.#loops.set(
			ev.action.id,
			setInterval(() => {
				const held = Date.now() - t0;
				if (held < 180) return;
				const boost = held < 700 ? 1 : Math.min(2.6, 1 + ((held - 700) / 900) * 1.6);
				slate.move(vx * norm * base * boost, vy * norm * base * boost);
			}, 16)
		);
		autoOpen();
	}

	override onKeyUp(ev: KeyUpEvent<ArrowSettings>): void {
		this.#stop(ev.action.id);
	}

	override onWillDisappear(ev: WillDisappearEvent<ArrowSettings>): void {
		this.#stop(ev.action.id);
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, ArrowSettings>): Promise<void> {
		await piCommand(ev.payload);
	}

	#stop(id: string): void {
		clearInterval(this.#loops.get(id));
		this.#loops.delete(id);
	}
}

/** Secouer : un appui efface un peu ; maintenu une seconde, tout s'efface. */
@action({ UUID: "com.medilase.retro-slate.shake" })
export class ShakeAction extends SingletonAction {
	#timers = new Map<string, NodeJS.Timeout>();

	override onKeyDown(ev: KeyDownEvent): void {
		slate.shake();
		clearTimeout(this.#timers.get(ev.action.id));
		this.#timers.set(
			ev.action.id,
			setTimeout(async () => {
				slate.clear();
				if (ev.action.isKey()) await ev.action.showOk();
			}, 1000)
		);
	}

	override onKeyUp(ev: KeyUpEvent): void {
		clearTimeout(this.#timers.get(ev.action.id));
		this.#timers.delete(ev.action.id);
	}
}

/** Ardoise : la touche montre le dessin en direct ; un appui ouvre la fenêtre sur l'ordinateur. */
@action({ UUID: "com.medilase.retro-slate.slate" })
export class SlateAction extends SingletonAction {
	constructor() {
		super();
		slate.on("change", throttle(() => this.#renderAll(), 180));
	}

	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		if (ev.action.isKey()) await ev.action.setImage(svgUrl(slate.keySvg()));
	}

	override async onKeyDown(): Promise<void> {
		await openSlate();
	}

	#renderAll(): void {
		const img = svgUrl(slate.keySvg());
		this.actions.forEach((a) => {
			if (a.isKey()) void a.setImage(img);
		});
	}
}

/** Photo : enregistre le dessin dans Images › Ardoise rétro. */
@action({ UUID: "com.medilase.retro-slate.photo" })
export class PhotoAction extends SingletonAction {
	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		if (!ev.action.isKey()) return;
		try {
			const file = await server.photo();
			streamDeck.logger.info(`Photo : ${file}`);
			await ev.action.showOk();
		} catch (e) {
			streamDeck.logger.error("Photo impossible", e);
			await ev.action.showAlert();
		}
	}
}

/** Image de touche : flèche métallique sur fond sombre. */
export function arrowSvg(dir: Dir): string {
	const a = ANGLES[dir] ?? 0;
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
		`<defs><radialGradient id="b" cx=".5" cy=".35" r=".85"><stop offset="0" stop-color="#2c3a40"/><stop offset="1" stop-color="#11171a"/></radialGradient>` +
		`<linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f5f6"/><stop offset=".55" stop-color="#b9bdc2"/><stop offset="1" stop-color="#7c8188"/></linearGradient></defs>` +
		`<rect width="144" height="144" fill="url(#b)"/>` +
		`<g transform="rotate(${a} 72 72)">` +
		`<path d="M30 62h48V40l38 32-38 32V82H30z" fill="url(#m)" stroke="#0b0f11" stroke-width="2" stroke-linejoin="round"/>` +
		`</g></svg>`
	);
}
