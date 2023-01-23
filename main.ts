#!/usr/bin/env -S deno run -A

import { $ } from "https://deno.land/x/dax@0.23.0/mod.ts";
import { join } from "https://deno.land/std@0.171.0/path/mod.ts";

const dirname = new URL(".", import.meta.url).pathname

const known_servers: { [lang: string]: server } = {
  lua: {
    name: "lua-language-server",
    mode: "release",
    src: join(dirname, "lua/bin/lua-language-server"),
    target: "$HOME/.local/bin/lua-language-server",
  },
  vim: {
    name: "vim-language-server",
    mode: "npm",
  },
  bash: {
    name: "bash-language-server",
    mode: "npm",
  },
  go: {
    name: "gopls",
    mode: "go",
  },
  python: {
    name: "pyright",
    mode: "npm",
  },
  css: {
    name: "vscode-langservers-extracted",
    mode: "npm",
    bin: "vscode-css-language-server",
  },
  json: {
    name: "vscode-langservers-extracted",
    mode: "npm",
    bin: "vscode-json-language-server",
  },
};

const ASSETS: { [language: string]: asset } = {
  LUA: {
    OWNER: "sumneko",
    NAME: "lua-language-server",
    TAG: "3.6.4",
    OS: "linux-x64",
    FILENAME: "{{NAME}}-{{TAG}}-{{OS}}.tar.gz",
  },
};

interface server {
  name: string;
  mode: string;
  src?: string;
  target?: string;
  bin?: string;
}

interface asset {
  OWNER: string;
  NAME: string;
  TAG: string;
  OS: string;
  FILENAME: string;
}

interface installer {
  install: () => Promise<void>;
  update: () => Promise<void>;
}

const exists = async (filepath: string): Promise<boolean> => {
  try {
    await Deno.stat(filepath);
    return true;
  } catch {
    return false;
  }
};

const npm = {
  async install(name: string, bin?: string) {
    const src = join(dirname, "node_modules/.bin", bin || name);
    const target = join("$HOME/.local/bin", bin || name);
    if (!await exists(src)) {
      await $`npm install -D ${name}`;
    }
    await $.raw`ln -fsn ${src} ${target}`;
  },

  async update(name: string) {
    await $`npm update -D ${name}`;
  },
};

const release = {
  async install(
    language: string,
    url: string,
    src: string,
    target: string,
    force = false,
  ) {
    if (force || !await exists(src)) {
      const tempFilePath = await Deno.makeTempFile();
      await $`rm ${tempFilePath}`;
      await $`wget ${url} -O ${tempFilePath}`;
      await Deno.mkdir(language, { recursive: true });
      await $`tar xf ${tempFilePath} -C ${language}`;
      await $`rm ${tempFilePath}`;
    }
    await $.raw`ln -fsn ${src} ${target}`;
  },
};

const go = {
  async install() {
    await $`go install golang.org/x/tools/gopls@latest`;
  },
};

const url_maker = (language: string): string | undefined => {
  const asset = ASSETS[language.toUpperCase()];
  if (!asset) return;
  const filename = asset.FILENAME
    .replace("{{NAME}}", asset.NAME)
    .replace("{{TAG}}", asset.TAG)
    .replace("{{OS}}", asset.OS);
  const url =
    `https://github.com/${asset.OWNER}/${asset.NAME}/releases/download/${asset.TAG}/${filename}`;
  return url;
};

const builder = (
  language: string,
  server: server,
): installer | undefined => {
  const name = server.name;
  const mode = server.mode;
  const src = server.src;
  const target = server.target;
  const bin = server.bin;
  switch (mode) {
    case "npm":
      return {
        async install() {
          await npm.install(name, bin);
        },
        async update() {
          await npm.update(name);
        },
      };
    case "release": {
      if (!src || !target) return;
      const url = url_maker(language);
      if (!url) return;
      return {
        async install() {
          await release.install(language, url, src, target);
        },
        async update() {
          await release.install(language, url, src, target, true);
        },
      };
    }
    case "go": {
      return {
        install: go.install,
        update: go.install,
      };
    }
  }
};

const main = () => {
  if (Deno.args.length < 2) {
    console.log("Missing arguments");
    Deno.exit(1);
  }
  const mode = Deno.args[0];
  if (mode !== "install" && mode !== "update") {
    return;
  }
  const installers = Deno.args[1] === "all"
    ? Object.entries(known_servers)
      .flatMap(([lang, server]) => builder(lang, server) || [])
    : Deno.args.slice(1)
      .flatMap((lang) => {
        const server = known_servers[lang];
        if (!server) return [];
        const installer = builder(lang, server);
        if (!installer) return [];
        return installer;
      });
  if (installers.length === 0) {
    console.log("No valid language");
    Deno.exit(1);
  }

  Promise.all(installers.map((installer) => {
    installer[mode]();
  }));
};

main();
