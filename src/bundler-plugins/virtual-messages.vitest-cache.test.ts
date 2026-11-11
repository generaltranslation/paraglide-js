import { expect, test } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "vite";
import { paraglideVitePlugin } from "./vite.js";

test("the Vitest cache key follows the output structure set in the project config", async () => {
	const root = await fs.realpath(
		await fs.mkdtemp(path.join(tmpdir(), "paraglide-vitest-cache-"))
	);
	const originalEnv = process.env.NODE_ENV;
	let server: Awaited<ReturnType<typeof createServer>> | undefined;
	try {
		process.env.NODE_ENV = "development";
		const project = path.join(root, "project.inlang");
		const config = path.join(project, "paraglide.config.js");
		await fs.mkdir(project);
		await fs.writeFile(path.join(root, "package.json"), '{"type":"module"}');
		await fs.writeFile(
			path.join(project, "settings.json"),
			JSON.stringify({
				baseLocale: "en",
				locales: ["en"],
				modules: ["./plugin.js"],
			})
		);
		await fs.writeFile(path.join(root, "messages.json"), "{}");
		await fs.writeFile(
			path.join(root, "plugin.js"),
			`export default {key:"plugin.fixture.cache",toBeImportedFiles:async()=>[{path:"./messages.json",locale:"en"}],importFiles:()=>({bundles:[{id:"greeting"}],messages:[{bundleId:"greeting",locale:"en"}],variants:[{messageBundleId:"greeting",messageLocale:"en",pattern:[{type:"text",value:"HELLO"}]}]})};`
		);
		await fs.writeFile(config, "export default {};");
		server = await createServer({
			root,
			configFile: false,
			logLevel: "silent",
			plugins: [
				paraglideVitePlugin({
					project,
					outdir: path.join(root, "out"),
					strategy: ["baseLocale"],
					emitGitIgnore: false,
					emitReadme: false,
					emitPrettierIgnore: false,
				}),
			],
			optimizeDeps: { noDiscovery: true },
			server: { port: 0, watch: null },
		});
		await server.listen();
		await server.pluginContainer.buildStart({});

		// What Vitest 5 does with `configureVitest` plugins.
		let generate: (() => string | undefined | null | false) | undefined;
		const optimize = server.config.plugins.find(
			(plugin) => plugin.name === "paraglide-virtual-message-imports"
		) as { configureVitest?: (context: unknown) => void } | undefined;
		optimize!.configureVitest!({
			defineCacheKeyGenerator: (callback: typeof generate) => {
				generate = callback;
			},
		});
		expect(generate).toBeDefined();

		const virtual = generate!();
		expect(virtual).toBeTruthy();
		expect(generate!()).toBe(virtual);

		await fs.writeFile(
			config,
			"export default { outputStructure: 'locale-modules' };"
		);
		await server.pluginContainer.watchChange(config, { event: "update" });
		const physical = generate!();
		expect(physical).not.toBe(virtual);

		await fs.writeFile(config, "export default {};");
		await server.pluginContainer.watchChange(config, { event: "update" });
		expect(generate!()).toBe(virtual);
	} finally {
		await server?.close();
		if (originalEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = originalEnv;
		await fs.rm(root, { recursive: true, force: true });
	}
});
