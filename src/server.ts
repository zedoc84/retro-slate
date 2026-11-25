import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { Slate, SlateMessage } from "./engine";

const FIRST_PORT = 47312;
export type WebFiles = Record<string, { type: string; body: string }>;

type Pending = { resolve: (file: string) => void; timer: NodeJS.Timeout };

/**
 * Petit serveur local (127.0.0.1 uniquement) qui sert la fenêtre de l'ardoise
 * et lui envoie les mouvements en direct (Server-Sent Events).
 */
export class SlateServer {
	port = 0;
	readonly clients = new Set<http.ServerResponse>();
	#server: http.Server | undefined;
	#pending = new Map<string, Pending>();

	constructor(
		private readonly slate: Slate,
		private readonly files: WebFiles,
		private readonly options: { lang: () => string; photoFolder: () => string }
	) {
		slate.on("change", (m: SlateMessage) => this.broadcast(m));
		setInterval(() => {
			for (const c of this.clients) c.write(": ping\n\n");
		}, 15000).unref();
	}

	get url(): string {
		return `http://127.0.0.1:${this.port}/`;
	}

	async start(): Promise<number> {
		for (let p = FIRST_PORT; p < FIRST_PORT + 20; p++) {
			try {
				await this.#listen(p);
				this.port = p;
				return p;
			} catch {
				/* port occupé : on essaie le suivant */
			}
		}
		throw new Error("Aucun port libre pour l'ardoise");
	}

	broadcast(m: object): void {
		const line = `data: ${JSON.stringify(m)}\n\n`;
		for (const c of this.clients) c.write(line);
	}

	/** Demande une photo PNG à la fenêtre ouverte ; sinon, photo vectorielle (SVG). */
	async photo(): Promise<string> {
		if (this.clients.size > 0) {
			const id = Math.random().toString(36).slice(2);
			const file = await new Promise<string | null>((resolve) => {
				const timer = setTimeout(() => {
					this.#pending.delete(id);
					resolve(null);
				}, 4000);
				this.#pending.set(id, { resolve, timer });
				this.broadcast({ t: "photo", id });
			});
			if (file) return file;
		}
		return this.#writePhoto(Buffer.from(this.slate.photoSvg(), "utf8"), "svg");
	}

	#listen(port: number): Promise<void> {
		return new Promise((resolve, reject) => {
			const server = http.createServer((req, res) => this.#handle(req, res, port));
			server.once("error", reject);
			server.listen(port, "127.0.0.1", () => {
				server.off("error", reject);
				// Le serveur ne retient pas le processus : quand Stream Deck se ferme, le plugin s'arrête aussi.
				server.unref();
				this.#server = server;
				resolve();
			});
		});
	}

	#handle(req: http.IncomingMessage, res: http.ServerResponse, port: number): void {
		// Contre le « DNS rebinding » : seules les adresses locales sont acceptées.
		const host = req.headers.host ?? "";
		if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return end(res, 403);
		const origin = req.headers.origin;
		if (req.method === "POST" && origin && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) {
			return end(res, 403);
		}

		const url = new URL(req.url ?? "/", `http://${host}`);
		if (req.method === "GET" && url.pathname === "/events") return this.#events(req, res);
		if (req.method === "POST" && url.pathname === "/input") return this.#input(req, res);
		if (req.method === "POST" && url.pathname === "/photo") return this.#photoUpload(req, res);
		if (req.method === "GET") return this.#static(url.pathname, res);
		end(res, 405);
	}

	#events(req: http.IncomingMessage, res: http.ServerResponse): void {
		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive"
		});
		res.write(`retry: 1000\n`);
		res.write(`data: ${JSON.stringify({ t: "init", lang: this.options.lang(), ...this.slate.snapshot() })}\n\n`);
		req.socket.unref();
		this.clients.add(res);
		req.on("close", () => this.clients.delete(res));
	}

	#input(req: http.IncomingMessage, res: http.ServerResponse): void {
		readBody(req, 8 * 1024)
			.then((body) => {
				const m = JSON.parse(body);
				switch (m?.t) {
					case "move":
						this.slate.move(Math.max(-60, Math.min(60, Number(m.dx) || 0)), Math.max(-60, Math.min(60, Number(m.dy) || 0)));
						break;
					case "shake":
						this.slate.shake();
						break;
					case "clear":
						this.slate.clear();
						break;
					case "frame":
						this.slate.setFrame(String(m.c));
						break;
				}
				end(res, 204);
			})
			.catch(() => end(res, 400));
	}

	#photoUpload(req: http.IncomingMessage, res: http.ServerResponse): void {
		readBody(req, 20 * 1024 * 1024)
			.then((body) => {
				const m = JSON.parse(body);
				const data = String(m?.data ?? "");
				const prefix = "data:image/png;base64,";
				if (!data.startsWith(prefix)) throw new Error("format");
				const png = Buffer.from(data.slice(prefix.length), "base64");
				if (png.length < 8 || png.readUInt32BE(0) !== 0x89504e47) throw new Error("png");
				const file = this.#writePhoto(png, "png");
				const p = m.id ? this.#pending.get(String(m.id)) : undefined;
				if (p) {
					clearTimeout(p.timer);
					this.#pending.delete(String(m.id));
					p.resolve(file);
				}
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ file, shown: shortPath(file) }));
			})
			.catch(() => end(res, 400));
	}

	#writePhoto(data: Buffer, ext: "png" | "svg"): string {
		const dir = this.options.photoFolder();
		fs.mkdirSync(dir, { recursive: true });
		const d = new Date();
		const z = (n: number) => String(n).padStart(2, "0");
		const stamp = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}.${z(d.getMinutes())}.${z(d.getSeconds())}`;
		const file = path.join(dir, `${stamp}.${ext}`);
		fs.writeFileSync(file, data);
		this.broadcast({ t: "saved", shown: shortPath(file) });
		return file;
	}

	#static(pathname: string, res: http.ServerResponse): void {
		const f = this.files[pathname === "/" ? "/index.html" : pathname];
		if (!f) return end(res, 404);
		res.writeHead(200, { "Content-Type": f.type, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
		res.end(f.body);
	}
}

function end(res: http.ServerResponse, code: number): void {
	res.writeHead(code);
	res.end();
}

function readBody(req: http.IncomingMessage, max: number): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		req.on("data", (c: Buffer) => {
			size += c.length;
			if (size > max) {
				reject(new Error("trop gros"));
				req.destroy();
				return;
			}
			chunks.push(c);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}

function shortPath(file: string): string {
	const home = os.homedir();
	return file.startsWith(home) ? "~" + file.slice(home.length) : file;
}
