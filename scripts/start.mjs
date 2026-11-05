import { spawn, spawnSync } from "node:child_process";

/** A failed database step is logged but must not stop the web server: the UI reports it instead. */
function prepareDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error("[start] DATABASE_URL is not set; skipping migrations and seed.");
    return;
  }
  const steps = [
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    ["prisma/seed.mjs"],
  ];
  for (const args of steps) {
    const { status } = spawnSync(process.execPath, args, { stdio: "inherit" });
    if (status !== 0) {
      console.error(`[start] "${args.join(" ")}" failed with status ${status}.`);
      return;
    }
  }
}

prepareDatabase();

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start"], {
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

server.on("exit", (code) => process.exit(code ?? 1));
