import streamDeck from "@elgato/streamdeck";
import { server, slate } from "./app";
import { KnobAction } from "./actions/knob";
import { ArrowAction, PhotoAction, ShakeAction, SlateAction } from "./actions/keys";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new KnobAction());
streamDeck.actions.registerAction(new ArrowAction());
streamDeck.actions.registerAction(new ShakeAction());
streamDeck.actions.registerAction(new SlateAction());
streamDeck.actions.registerAction(new PhotoAction());

server
	.start()
	.then((port) => streamDeck.logger.info(`Ardoise prête sur http://127.0.0.1:${port}/`))
	.catch((e) => streamDeck.logger.error("Serveur de l'ardoise", e));

for (const sig of ["SIGINT", "SIGTERM"] as const) {
	process.on(sig, () => {
		slate.save();
		process.exit(0);
	});
}

streamDeck.connect();
