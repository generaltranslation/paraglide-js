import { afterEach, beforeEach, expect, test, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";
import {
	build,
	createServer,
	createRunnableDevEnvironment,
	isRunnableDevEnvironment,
	parseAst,
} from "vite";
import {
	paraglideVitePlugin,
	type ParaglideVitePluginOptions,
} from "./vite.js";

const directories: string[] = [];
let originalNodeEnv: string | undefined;
beforeEach(() => {
	originalNodeEnv = process.env.NODE_ENV;
});
afterEach(async () => {
	if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
	else process.env.NODE_ENV = originalNodeEnv;
	await Promise.all(
		directories
			.splice(0)
			.map((directory) => fs.rm(directory, { recursive: true, force: true }))
	);
});

async function fixture(count = 3) {
	const root = await fs.realpath(
		await fs.mkdtemp(path.join(tmpdir(), "paraglide-vite-defaults-"))
	);
	directories.push(root);
	const project = path.join(root, "project.inlang");
	const outdir = path.join(root, "paraglide");
	await fs.mkdir(project);
	await fs.writeFile(path.join(root, "package.json"), '{"type":"module"}');
	await fs.writeFile(
		path.join(project, "settings.json"),
		JSON.stringify({
			baseLocale: "en",
			locales: ["en", "de", "fr"],
			modules: ["./plugin.js"],
		})
	);
	await fs.writeFile(
		path.join(root, "plugin.js"),
		`export default {
		key: "plugin.fixture.defaults",
		toBeImportedFiles: async () => ["en", "de", "fr"].map(locale => ({ path: locale + ".json", locale })),
		importFiles: ({files}) => {
			const entries = files.flatMap(file => Object.entries(JSON.parse(new TextDecoder().decode(file.content))).map(([id, value]) => ({ id, value, locale: file.locale })));
			return { bundles: [...new Set(entries.map(entry => entry.id))].map(id => ({id})), messages: entries.map(({id, locale}) => ({bundleId:id, locale})), variants: entries.map(({id,locale,value}) => ({messageBundleId:id,messageLocale:locale,pattern:[{type:"text",value}]})) };
		}
	};`
	);
	const catalog = {
		greeting: "HELLO",
		unused: "UNUSED_TREE_SHAKE_SENTINEL",
		...Object.fromEntries(
			Array.from({ length: count }, (_, i) => [`msg_${i}`, `Message ${i}`])
		),
	};
	for (const locale of ["en", "de", "fr"])
		await fs.writeFile(
			path.join(root, `${locale}.json`),
			JSON.stringify(catalog)
		);
	await fs.writeFile(
		path.join(root, "entry.js"),
		'export {m} from "./paraglide/messages.js";'
	);
	await fs.writeFile(
		path.join(root, "index.html"),
		'<script type="module" src="/entry.js"></script>'
	);
	const options = {
		project,
		outdir,
		strategy: ["baseLocale" as const],
		emitGitIgnore: false,
		emitReadme: false,
		emitPrettierIgnore: false,
	};
	return { root, project, outdir, options };
}

async function serve(
	f: Awaited<ReturnType<typeof fixture>>,
	options: Partial<ParaglideVitePluginOptions> = {}
) {
	const server = await createServer({
		root: f.root,
		configFile: false,
		logLevel: "silent",
		plugins: [paraglideVitePlugin({ ...f.options, ...options })],
		server: { port: 0 },
		optimizeDeps: { noDiscovery: true },
	});
	await server.listen();
	return server;
}

// Fetch the static HTTP graph that a browser loads, rather than timing a tiny
// catalog. The number of locale modules must not grow with the message count.
async function httpGraph(server: Awaited<ReturnType<typeof createServer>>) {
	const base = server.resolvedUrls!.local[0]!;
	const pending = ["/entry.js"];
	const seen = new Set<string>();
	while (pending.length) {
		const url = pending.pop()!;
		if (seen.has(url)) continue;
		seen.add(url);
		const response = await fetch(new URL(url, base));
		expect(response.status).toBe(200);
		const ast = parseAst(await response.text());
		for (const statement of ast.body) {
			if (
				(statement.type === "ImportDeclaration" ||
					statement.type === "ExportNamedDeclaration" ||
					statement.type === "ExportAllDeclaration") &&
				statement.source &&
				typeof statement.source.value === "string" &&
				statement.source.value.startsWith("/") &&
				statement.source.value !== "/@vite/client"
			)
				pending.push(statement.source.value);
		}
	}
	return [...seen].filter((url) => url.includes("/messages"));
}

test.each([30, 300])(
	"default serve loads a bounded message graph for %i messages (#880)",
	async (count) => {
		const f = await fixture(count);
		const server = await serve(f);
		try {
			const requests = await httpGraph(server);
			expect(requests.sort()).toEqual([
				"/paraglide/messages.js",
				"/paraglide/messages/_index.js",
				"/paraglide/messages/de.js",
				"/paraglide/messages/en.js",
				"/paraglide/messages/fr.js",
			]);
			await fs.access(path.join(f.outdir, "messages.d.ts"));
			await expect(
				fs.access(path.join(f.outdir, "messages.virtual.d.ts"))
			).rejects.toThrow();
			await fs.writeFile(
				path.join(f.root, "consumer.ts"),
				'import {m} from "./paraglide/messages.js";\nconst message: string = m.greeting();\n// @ts-expect-error unknown messages must remain typed\nm.missing();\n'
			);
			const program = ts.createProgram([path.join(f.root, "consumer.ts")], {
				noEmit: true,
				strict: true,
				skipLibCheck: true,
				types: [],
				target: ts.ScriptTarget.ES2022,
				module: ts.ModuleKind.NodeNext,
				moduleResolution: ts.ModuleResolutionKind.NodeNext,
			});
			expect(
				ts
					.getPreEmitDiagnostics(program)
					.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
			).toEqual([]);
		} finally {
			await server.close();
		}
	}
);

test.each(["production", "test"])(
	"serve uses locale modules with NODE_ENV=%s, regardless of diagnostics (#880)",
	async (nodeEnv) => {
		process.env.NODE_ENV = nodeEnv;
		const f = await fixture();
		const server = await serve(f, { isDevelopment: "false" });
		try {
			await server.ssrLoadModule("/entry.js");
			await fs.access(path.join(f.outdir, "messages/en.js"));
		} finally {
			await server.close();
		}
	}
);

test.each([
	{
		plugin: "virtual-modules",
		config: "locale-modules",
		expected: "virtual-modules",
	},
	{
		plugin: "locale-modules",
		config: "virtual-modules",
		expected: "locale-modules",
	},
	{ plugin: undefined, config: "virtual-modules", expected: "virtual-modules" },
	{ plugin: undefined, config: "message-modules", expected: "message-modules" },
	{ plugin: undefined, config: "locale-modules", expected: "locale-modules" },
] as const)(
	"serve respects plugin=$plugin and config=$config (#880)",
	async ({ plugin, config, expected }) => {
		const f = await fixture();
		await fs.writeFile(
			path.join(f.project, "paraglide.config.js"),
			`export default {outputStructure: ${JSON.stringify(config)}};`
		);
		const server = await serve(f, { outputStructure: plugin });
		try {
			expect((await server.ssrLoadModule("/entry.js")).m.greeting()).toBe(
				"HELLO"
			);
			const facade = await fs.readFile(
				path.join(f.outdir, "messages.js"),
				"utf8"
			);
			expect(facade.includes("virtual:paraglide/")).toBe(
				expected === "virtual-modules"
			);
			if (expected !== "virtual-modules")
				await fs.access(
					path.join(
						f.outdir,
						expected === "locale-modules"
							? "messages/en.js"
							: "messages/greeting.js"
					)
				);
			// Explicit physical layouts keep their pre-existing declaration default.
			expect(
				await fs.access(path.join(f.outdir, "messages.d.ts")).then(
					() => true,
					() => false
				)
			).toBe(expected === "virtual-modules");
		} finally {
			await server.close();
		}
	}
);

test("default serve honors an explicit declaration opt-out (#880)", async () => {
	const f = await fixture();
	const server = await serve(f, { emitTsDeclarations: false });
	try {
		await server.ssrLoadModule("/entry.js");
		await expect(
			fs.access(path.join(f.outdir, "messages.d.ts"))
		).rejects.toThrow();
	} finally {
		await server.close();
	}
});

test("default serve updates physical messages in SSR and custom environments through native watching (#880)", async () => {
	const f = await fixture();
	const server = await createServer({
		root: f.root,
		configFile: false,
		logLevel: "silent",
		plugins: [paraglideVitePlugin(f.options)],
		server: { port: 0 },
		optimizeDeps: { noDiscovery: true },
		environments: {
			custom: {
				consumer: "server",
				dev: {
					createEnvironment: (name, config) =>
						createRunnableDevEnvironment(name, config),
				},
			},
		},
	});
	try {
		await server.listen();
		const custom = server.environments.custom!;
		if (!isRunnableDevEnvironment(custom))
			throw new Error("Expected a runnable custom environment");
		const load = async () => [
			await server.ssrLoadModule("/entry.js"),
			await custom.runner.import("/entry.js"),
		];
		for (const module of await load())
			expect(module.m.greeting()).toBe("HELLO");
		await fs.writeFile(
			path.join(f.root, "en.json"),
			JSON.stringify({ greeting: "EDITED", added: "ADDED" })
		);
		await vi.waitFor(
			async () => {
				for (const module of await load()) {
					expect(module.m.greeting()).toBe("EDITED");
					expect(module.m.added()).toBe("ADDED");
				}
			},
			{ timeout: 10000 }
		);
		await fs.writeFile(
			path.join(f.root, "en.json"),
			JSON.stringify({ greeting: "FINAL" })
		);
		await vi.waitFor(
			async () => {
				for (const module of await load()) {
					expect(module.m.greeting()).toBe("FINAL");
					expect(module.m.added).toBeUndefined();
				}
			},
			{ timeout: 10000 }
		);
	} finally {
		await server.close();
	}
});

test("serve-build-serve restores each default and removes stale output (#880)", async () => {
	const f = await fixture();
	let server = await serve(f);
	try {
		await server.ssrLoadModule("/entry.js");
		await fs.access(path.join(f.outdir, "messages/en.js"));
	} finally {
		await server.close();
	}
	await fs.writeFile(
		path.join(f.root, "entry.js"),
		'import {m} from "./paraglide/messages.js"; console.log(m.greeting());'
	);
	process.env.NODE_ENV = "development";
	const result = await build({
		root: f.root,
		configFile: false,
		mode: "development",
		logLevel: "silent",
		plugins: [paraglideVitePlugin({ ...f.options, isDevelopment: "true" })],
		build: { write: false },
	});
	if (Array.isArray(result) || !("output" in result))
		throw new Error("Expected a client bundle");
	expect(
		result.output
			.map((item) => (item.type === "chunk" ? item.code : ""))
			.join("\n")
	).not.toContain("UNUSED_TREE_SHAKE_SENTINEL");
	await fs.access(path.join(f.outdir, "messages.virtual.d.ts"));
	await expect(
		fs.access(path.join(f.outdir, "messages/en.js"))
	).rejects.toThrow();
	server = await serve(f);
	try {
		await server.transformRequest("/entry.js");
		await fs.access(path.join(f.outdir, "messages/en.js"));
		await expect(
			fs.access(path.join(f.outdir, "messages.virtual.d.ts"))
		).rejects.toThrow();
	} finally {
		await server.close();
	}
});

test("removing a watched layout override restores the serve default (#880)", async () => {
	const f = await fixture();
	const config = path.join(f.project, "paraglide.config.js");
	await fs.writeFile(
		config,
		'export default {outputStructure: "virtual-modules"};'
	);
	const server = await serve(f);
	try {
		expect((await server.ssrLoadModule("/entry.js")).m.greeting()).toBe(
			"HELLO"
		);
		await fs.writeFile(config, "export default {};");
		await vi.waitFor(
			async () => {
				await fs.access(path.join(f.outdir, "messages/en.js"));
				await expect(
					fs.access(path.join(f.outdir, "messages.virtual.d.ts"))
				).rejects.toThrow();
				expect((await server.ssrLoadModule("/entry.js")).m.greeting()).toBe(
					"HELLO"
				);
			},
			{ timeout: 10000 }
		);
	} finally {
		await server.close();
	}
});
