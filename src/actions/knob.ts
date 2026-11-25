import streamDeck, {
	action,
	DialAction,
	DialDownEvent,
	DialRotateEvent,
	DidReceiveSettingsEvent,
	SendToPluginEvent,
	SingletonAction,
	TouchTapEvent,
	WillAppearEvent,
	WillDisappearEvent
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { autoOpen, openSlate, slate, svgUrl, t, throttle } from "../app";
import { H, W } from "../engine";

type Axis = "auto" | "h" | "v";
type KnobSettings = { axis?: Axis; speed?: number };

const STEPS = [1, 3, 8];
const DEG_PER_TICK = 15;

/**
 * Molette du Stream Deck + : un bouton de l'ardoise.
 * Tourner = tracer, appuyer = vitesse, toucher l'écran = secouer, appui long = tout effacer.
 * En réglage « Auto », la molette la plus à gauche trace à l'horizontale, l'autre à la verticale.
 */
@action({ UUID: "com.medilase.retro-slate.knob" })
export class KnobAction extends SingletonAction<KnobSettings> {
	#angle = new Map<string, number>();
	#settings = new Map<string, KnobSettings>();

	constructor() {
		super();
		slate.on("change", throttle(() => this.#renderAll(), 50));
	}

	override async onWillAppear(ev: WillAppearEvent<KnobSettings>): Promise<void> {
		if (!ev.action.isDial()) return;
		this.#settings.set(ev.action.id, ev.payload.settings ?? {});
		const tx = t();
		await ev.action.setTriggerDescription({ rotate: tx.rotate, push: tx.push, touch: tx.touch, longTouch: tx.longTouch });
		setTimeout(() => this.#renderAll(), 0);
	}

	override onWillDisappear(ev: WillDisappearEvent<KnobSettings>): void {
		this.#settings.delete(ev.action.id);
		setTimeout(() => this.#renderAll(), 0);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<KnobSettings>): void {
		this.#settings.set(ev.action.id, ev.payload.settings ?? {});
		this.#renderAll();
	}

	override async onDialRotate(ev: DialRotateEvent<KnobSettings>): Promise<void> {
		const s = this.#settings.get(ev.action.id) ?? ev.payload.settings ?? {};
		const step = STEPS[s.speed ?? 1] ?? 3;
		const d = ev.payload.ticks * step;
		// Comme sur la vraie : à gauche, sens horaire = vers la droite ; à droite, sens horaire = vers le haut.
		if (this.#axisOf(ev.action) === "h") slate.move(d, 0);
		else slate.move(0, -d);
		this.#angle.set(ev.action.id, (this.#angle.get(ev.action.id) ?? 0) + ev.payload.ticks * DEG_PER_TICK);
		await this.#render(ev.action);
		autoOpen();
	}

	override async onDialDown(ev: DialDownEvent<KnobSettings>): Promise<void> {
		const s = { ...(this.#settings.get(ev.action.id) ?? ev.payload.settings ?? {}) };
		s.speed = ((s.speed ?? 1) + 1) % STEPS.length;
		this.#settings.set(ev.action.id, s);
		await ev.action.setSettings(s);
		await this.#render(ev.action);
	}

	override onTouchTap(ev: TouchTapEvent<KnobSettings>): void {
		if (ev.payload.hold) slate.clear();
		else slate.shake();
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, KnobSettings>): Promise<void> {
		const p = ev.payload as { cmd?: string } | null;
		if (p?.cmd === "open") await openSlate();
	}

	/** Axe effectif d'une molette (gère le mode Auto). */
	#axisOf(a: DialAction<KnobSettings>): "h" | "v" {
		const own = this.#settings.get(a.id)?.axis ?? "auto";
		if (own === "h" || own === "v") return own;

		const dials: { id: string; col: number; axis: Axis }[] = [];
		this.actions.forEach((x) => {
			if (x.isDial() && x.device.id === a.device.id) {
				dials.push({ id: x.id, col: x.coordinates.column, axis: this.#settings.get(x.id)?.axis ?? "auto" });
			}
		});
		const fixed = new Set(dials.filter((d) => d.axis !== "auto").map((d) => d.axis));
		if (fixed.has("h") && !fixed.has("v")) return "v";
		if (fixed.has("v") && !fixed.has("h")) return "h";
		const autos = dials.filter((d) => d.axis === "auto").sort((p, q) => p.col - q.col);
		return autos[0]?.id === a.id || autos.length === 0 ? "h" : "v";
	}

	#renderAll(): void {
		this.actions.forEach((a) => {
			if (a.isDial()) void this.#render(a);
		});
	}

	async #render(a: DialAction<KnobSettings>): Promise<void> {
		const tx = t();
		const axis = this.#axisOf(a);
		const speed = this.#settings.get(a.id)?.speed ?? 1;
		const pct = axis === "h" ? (slate.x / W) * 100 : (1 - slate.y / H) * 100;
		try {
			await a.setFeedback({
				title: axis === "h" ? `↔ ${tx.h}` : `↕ ${tx.v}`,
				value: tx.speeds[speed] ?? tx.speeds[1],
				indicator: { value: Math.round(pct) }
			});
		} catch (e) {
			streamDeck.logger.warn("feedback", e);
		}
		try {
			await a.setFeedback({ icon: svgUrl(knobSvg(this.#angle.get(a.id) ?? 0)) });
		} catch {
			/* l'icône statique du manifeste reste affichée */
		}
	}
}

/** Bouton métallique moleté, tourné de `deg` degrés. */
export function knobSvg(deg: number): string {
	let knurl = "";
	for (let i = 0; i < 24; i++) {
		const a = (i * 15 * Math.PI) / 180;
		const x1 = 24 + Math.cos(a) * 17, y1 = 24 + Math.sin(a) * 17;
		const x2 = 24 + Math.cos(a) * 21, y2 = 24 + Math.sin(a) * 21;
		knurl += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
	}
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">` +
		`<defs><radialGradient id="g" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#b6babf"/><stop offset="1" stop-color="#5f646b"/></radialGradient>` +
		`<radialGradient id="c" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#f4f5f6"/><stop offset="1" stop-color="#9a9fa6"/></radialGradient></defs>` +
		`<g transform="rotate(${deg % 360} 24 24)">` +
		`<circle cx="24" cy="24" r="22" fill="url(#g)" stroke="#3d4147" stroke-width="1"/>` +
		`<path d="${knurl}" stroke="#55595f" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>` +
		`<circle cx="24" cy="24" r="13" fill="url(#c)"/>` +
		`<rect x="22.6" y="6" width="2.8" height="9" rx="1.4" fill="#2b2e33"/>` +
		`</g></svg>`
	);
}
