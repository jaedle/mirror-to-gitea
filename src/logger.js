import pino from "pino";

export class Logger {
	constructor() {
		this.pino = pino({
			level: "trace",
			redact: ["config.gitea.token", "config.github.token"],
			timestamp: pino.stdTimeFunctions.isoTime,
			formatters: {
				level: this.prettyLevels(),
				bindings: this.noPidOrHostname(),
			},
		});
	}

	prettyLevels() {
		return (label) => ({ level: label });
	}

	noPidOrHostname() {
		return () => {};
	}

	showConfig(config) {
		this.pino.info({ config: config }, "applied configuration");
	}
}
