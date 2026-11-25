import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";

/** Taille logique de l'écran de l'ardoise (en unités). */
export const W = 640;
export const H = 440;

/** Un trait : x1, y1, x2, y2, opacité (0–1). */
export type Seg = [number, number, number, number, number];

/** Couleurs de cadre proposées (aucune n'imite le jouet d'origine). */
export const FRAMES: Record<string, { base: string; light: string; dark: string }> = {
	petrole: { base: "#1f6672", light: "#3a8f9b", dark: "#0f3d45" },
	moutarde: { base: "#d19a1c", light: "#f0c457", dark: "#8a6209" },
	sapin: { base: "#2f6040", light: "#4f8c63", dark: "#173823" },
	noyer: { base: "#7a4b2a", light: "#a8714a", dark: "#432612" },
	anthracite: { base: "#3a3f47", light: "#5d646f", dark: "#1d2025" },
	lilas: { base: "#7d64a8", light: "#a690cc", dark: "#4b3770" }
};

export type SlateMessage =
	| { t: "mv"; x: number; y: number; dx: number; dy: number; i: number; s: Seg }
	| { t: "state"; x: number; y: number; segs: Seg[] }
	| { t: "shake"; full: boolean }
	| { t: "frame"; c: string };

const MAX_SEGS = 40000;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/**
 * L'ardoise : position du stylet, traits, couleur du cadre.
 * Source de vérité unique, partagée par les touches, les molettes et la fenêtre de l'ordinateur.
 */
export class Slate extends EventEmitter {
	x = W / 2;
	y = H / 2;
	segs: Seg[] = [];
	frame = "petrole";
	#saveTimer: NodeJS.Timeout | undefined;

	constructor(private readonly file: string) {
		super();
		this.setMaxListeners(50);
		this.#load();
	}

	/** Déplace le stylet et trace (comme tourner un bouton). */
	move(dx: number, dy: number): void {
		if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
		const nx = r2(clamp(this.x + dx, 0, W));
		const ny = r2(clamp(this.y + dy, 0, H));
		const rdx = nx - this.x;
		const rdy = ny - this.y;
		if (Math.abs(rdx) < 0.005 && Math.abs(rdy) < 0.005) return; // contre le bord

		const last = this.segs[this.segs.length - 1];
		let i: number;
		if (last && last[4] === 1 && last[2] === this.x && last[3] === this.y && sameDirection(last, rdx, rdy)) {
			last[2] = nx;
			last[3] = ny;
			i = this.segs.length - 1;
		} else {
			this.segs.push([this.x, this.y, nx, ny, 1]);
			i = this.segs.length - 1;
			if (this.segs.length > MAX_SEGS) {
				this.segs.splice(0, this.segs.length - MAX_SEGS);
				i = this.segs.length - 1;
			}
		}
		this.x = nx;
		this.y = ny;
		this.#emit({ t: "mv", x: nx, y: ny, dx: rdx, dy: rdy, i, s: this.segs[i] });
	}

	/** Une secousse : le trait s'efface par plaques, comme la poudre qui retombe. */
	shake(power = 0.45): void {
		const out: Seg[] = [];
		const split = this.segs.length < 6000;
		for (const s of this.segs) {
			const len = Math.hypot(s[2] - s[0], s[3] - s[1]);
			const n = split && len > 16 ? Math.ceil(len / (9 + Math.random() * 7)) : 1;
			for (let k = 0; k < n; k++) {
				const a = k / n;
				const b = (k + 1) / n;
				const o = s[4] * (1 - power * (0.5 + Math.random() * 1.0));
				if (o <= 0.07) continue;
				out.push([
					r2(s[0] + (s[2] - s[0]) * a),
					r2(s[1] + (s[3] - s[1]) * a),
					r2(s[0] + (s[2] - s[0]) * b),
					r2(s[1] + (s[3] - s[1]) * b),
					r2(o)
				]);
			}
		}
		this.segs = out.slice(-MAX_SEGS);
		this.#emit({ t: "shake", full: false });
		this.#emit({ t: "state", x: this.x, y: this.y, segs: this.segs });
	}

	/** Grande secousse : tout s'efface. */
	clear(): void {
		this.segs = [];
		this.#emit({ t: "shake", full: true });
		this.#emit({ t: "state", x: this.x, y: this.y, segs: this.segs });
	}

	setFrame(c: string): void {
		if (!FRAMES[c] || c === this.frame) return;
		this.frame = c;
		this.#emit({ t: "frame", c });
	}

	snapshot() {
		return { W, H, x: this.x, y: this.y, segs: this.segs, frame: this.frame, frames: FRAMES };
	}

	/** Aperçu SVG pour une touche (144 × 144) : la petite ardoise et son dessin. */
	keySvg(): string {
		const f = FRAMES[this.frame] ?? FRAMES.petrole;
		const sx = 10, sy = 12, sw = 124, sh = (124 * H) / W;
		const path = this.#paths(sx, sy, sw / W, 1.7);
		const cx = sx + (this.x * sw) / W;
		const cy = sy + (this.y * sh) / H;
		return (
			`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
			`<defs><linearGradient id="f" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${f.light}"/><stop offset=".45" stop-color="${f.base}"/><stop offset="1" stop-color="${f.dark}"/></linearGradient>` +
			`<radialGradient id="s" cx=".3" cy=".25" r="1"><stop offset="0" stop-color="#e6e6e1"/><stop offset=".7" stop-color="#c2c2bc"/><stop offset="1" stop-color="#b2b2ac"/></radialGradient>` +
			`<radialGradient id="k" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#b9bcc0"/><stop offset="1" stop-color="#6d7177"/></radialGradient></defs>` +
			`<rect width="144" height="144" rx="18" fill="url(#f)"/>` +
			`<rect x="${sx - 2}" y="${sy - 2}" width="${sw + 4}" height="${sh + 4}" rx="5" fill="${f.dark}" opacity=".55"/>` +
			`<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="3.5" fill="url(#s)"/>` +
			path +
			`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="1.4" fill="#262626"/>` +
			`<circle cx="24" cy="121" r="12" fill="url(#k)" stroke="${f.dark}" stroke-width="1.2"/>` +
			`<circle cx="120" cy="121" r="12" fill="url(#k)" stroke="${f.dark}" stroke-width="1.2"/>` +
			`</svg>`
		);
	}

	/** Photo vectorielle de toute l'ardoise (utilisée si la fenêtre n'est pas ouverte). */
	photoSvg(): string {
		const f = FRAMES[this.frame] ?? FRAMES.petrole;
		const sx = 80, sy = 70, sw = 840, sh = (840 * H) / W;
		const path = this.#paths(sx, sy, sw / W, 2.4);
		return (
			`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="860" viewBox="0 0 1000 860">` +
			`<defs><linearGradient id="f" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${f.light}"/><stop offset=".45" stop-color="${f.base}"/><stop offset="1" stop-color="${f.dark}"/></linearGradient>` +
			`<radialGradient id="s" cx=".3" cy=".2" r="1.1"><stop offset="0" stop-color="#e4e4df"/><stop offset=".65" stop-color="#c4c4bf"/><stop offset="1" stop-color="#b3b3ae"/></radialGradient>` +
			`<radialGradient id="k" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#b9bcc0"/><stop offset="1" stop-color="#6d7177"/></radialGradient></defs>` +
			`<rect width="1000" height="860" rx="70" fill="url(#f)"/>` +
			`<rect x="${sx - 14}" y="${sy - 14}" width="${sw + 28}" height="${sh + 28}" rx="26" fill="${f.dark}" opacity=".5"/>` +
			`<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="16" fill="url(#s)"/>` +
			path +
			`<circle cx="110" cy="760" r="62" fill="url(#k)" stroke="${f.dark}" stroke-width="4"/>` +
			`<circle cx="890" cy="760" r="62" fill="url(#k)" stroke="${f.dark}" stroke-width="4"/>` +
			`</svg>`
		);
	}

	/** Regroupe les traits en chemins SVG par niveau d'opacité. */
	#paths(ox: number, oy: number, k: number, width: number): string {
		const buckets = new Map<number, string[]>();
		let lastEnd: [number, number] | null = null;
		let lastBucket = -1;
		for (const s of this.segs) {
			const b = Math.min(5, Math.max(1, Math.round(s[4] * 5)));
			const x1 = r2(ox + s[0] * k), y1 = r2(oy + s[1] * k);
			const x2 = r2(ox + s[2] * k), y2 = r2(oy + s[3] * k);
			let parts = buckets.get(b);
			if (!parts) buckets.set(b, (parts = []));
			if (lastEnd && b === lastBucket && lastEnd[0] === x1 && lastEnd[1] === y1) parts.push(`L${x2} ${y2}`);
			else parts.push(`M${x1} ${y1}L${x2} ${y2}`);
			lastEnd = [x2, y2];
			lastBucket = b;
		}
		let out = "";
		for (const [b, parts] of buckets) {
			out += `<path d="${parts.join("")}" fill="none" stroke="#3b3b39" stroke-opacity="${b / 5}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
		}
		return out;
	}

	#emit(m: SlateMessage): void {
		this.emit("change", m);
		this.#scheduleSave();
	}

	#scheduleSave(): void {
		clearTimeout(this.#saveTimer);
		this.#saveTimer = setTimeout(() => this.save(), 1500);
	}

	/** L'ardoise garde son dessin quand on la range, comme la vraie. */
	save(): void {
		try {
			fs.mkdirSync(path.dirname(this.file), { recursive: true });
			const data = JSON.stringify({ v: 1, x: this.x, y: this.y, frame: this.frame, segs: this.segs });
			fs.writeFileSync(this.file + ".tmp", data);
			fs.renameSync(this.file + ".tmp", this.file);
		} catch {
			/* sans gravité */
		}
	}

	#load(): void {
		try {
			const d = JSON.parse(fs.readFileSync(this.file, "utf8"));
			if (d?.v !== 1) return;
			if (Number.isFinite(d.x)) this.x = clamp(d.x, 0, W);
			if (Number.isFinite(d.y)) this.y = clamp(d.y, 0, H);
			if (typeof d.frame === "string" && FRAMES[d.frame]) this.frame = d.frame;
			if (Array.isArray(d.segs)) {
				this.segs = d.segs
					.filter((s: unknown) => Array.isArray(s) && s.length === 5 && s.every((n) => Number.isFinite(n)))
					.slice(-MAX_SEGS);
			}
		} catch {
			/* première utilisation */
		}
	}
}

function sameDirection(s: Seg, dx: number, dy: number): boolean {
	const ldx = s[2] - s[0];
	const ldy = s[3] - s[1];
	const cross = ldx * dy - ldy * dx;
	const dot = ldx * dx + ldy * dy;
	// tolérance ≈ 0,5° : les diagonales arrondies au centième restent un seul trait
	return dot > 0 && Math.abs(cross) <= 0.008 * Math.hypot(ldx, ldy) * Math.hypot(dx, dy) + 1e-9;
}
