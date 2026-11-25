/* Inspecteur de propriétés minimal, sans dépendance (protocole WebSocket de Stream Deck). */
(function () {
	let ws = null;
	let uuid = "";
	let settings = {};

	const PI = (window.PI = {
		lang: "en",
		onReady: null,
		get: (k, d) => (settings[k] === undefined ? d : settings[k]),
		set(k, v) {
			settings[k] = v;
			send({ event: "setSettings", context: uuid, payload: settings });
		},
		toPlugin(payload) {
			send({ event: "sendToPlugin", context: uuid, action: PI.action, payload });
		}
	});

	function send(o) {
		if (ws && ws.readyState === 1) ws.send(JSON.stringify(o));
	}

	window.connectElgatoStreamDeckSocket = function (port, piUUID, registerEvent, info, actionInfo) {
		uuid = piUUID;
		try {
			const i = JSON.parse(info);
			PI.lang = String(i.application.language || "en").startsWith("fr") ? "fr" : "en";
		} catch (e) {}
		try {
			const a = JSON.parse(actionInfo);
			settings = (a.payload && a.payload.settings) || {};
			PI.action = a.action;
		} catch (e) {}
		document.querySelectorAll("[data-fr]").forEach((el) => {
			el.innerHTML = PI.lang === "fr" ? el.dataset.fr : el.dataset.en;
		});
		ws = new WebSocket("ws://127.0.0.1:" + port);
		ws.onopen = () => send({ event: registerEvent, uuid });
		ws.onmessage = (e) => {
			const m = JSON.parse(e.data);
			if (m.event === "didReceiveSettings" && m.payload) {
				settings = m.payload.settings || {};
				PI.onReady && PI.onReady();
			}
		};
		PI.onReady && PI.onReady();
	};
})();
