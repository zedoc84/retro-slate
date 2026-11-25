// Banc d'essai hors Stream Deck : sert la fenêtre de l'ardoise et expose le moteur.
import fs from "node:fs";
import path from "node:path";
import { Slate } from "../src/engine";
import { SlateServer } from "../src/server";
import { knobSvg } from "../src/actions/knob";
import { arrowSvg } from "../src/actions/keys";

const root = path.resolve(import.meta.dirname, "..");
const slate = new Slate("/tmp/ardoise-dev/drawing.json");
const web = (f: string) => fs.readFileSync(path.join(root, "src", "web", f), "utf8");
const server = new SlateServer(slate, {
	"/index.html": { type: "text/html; charset=utf-8", body: web("index.html") },
	"/favicon.svg": { type: "image/svg+xml", body: web("favicon.svg") }
}, {
	lang: () => process.env.LANG_SD ?? "fr",
	photoFolder: () => "/tmp/ardoise-dev/photos"
});
const port = await server.start();
console.log("PORT", port);
// commandes de test par stdin : "key" écrit l'aperçu de touche, "knob 45", "photo"
process.stdin.on("data", async (b) => {
	for (const line of b.toString().trim().split("\n")) {
		const [cmd, arg] = line.split(" ");
		if (cmd === "key") fs.writeFileSync("/tmp/ardoise-dev/key.svg", slate.keySvg());
		if (cmd === "knob") fs.writeFileSync("/tmp/ardoise-dev/knob.svg", knobSvg(Number(arg)));
		if (cmd === "arrow") fs.writeFileSync("/tmp/ardoise-dev/arrow.svg", arrowSvg(arg as any));
		if (cmd === "photo") console.log("PHOTO", await server.photo());
		if (cmd === "svg") fs.writeFileSync("/tmp/ardoise-dev/photo.svg", slate.photoSvg());
		console.log("OK", cmd);
	}
});
if (process.env.PHOTO_TEST) setTimeout(async () => console.log("PHOTO", await server.photo()), 3500);
