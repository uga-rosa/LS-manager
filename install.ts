#!/usr/bin/env -S deno run -A

import { $ } from "https://deno.land/x/dax@0.23.0/mod.ts";

const ASSETS: { [language: string]: asset } = {
  LUA: {
    OWNER: "sumneko",
    NAME: "lua-language-server",
    TAG: "3.6.4",
    OS: "linux-x64",
    FILENAME: "{{NAME}}-{{TAG}}-{{OS}}.tar.gz",
  },
};

interface asset {
  OWNER: string;
  NAME: string;
  TAG: string;
  OS: string;
  FILENAME: string;
}

const npm = {
  async install(name: string) {
    await $.raw`npm install -D ${name}`;
    await $.raw`ln -fsn "../node_modules/.bin/${name}" "bin/${name}"`;
  },

  async update(name: string) {
    await $.raw`npm update -D ${name}`;
  },
};

const release = {
  async install(language: string, url: string, src: string, target: string) {
    const tempFilePath = await Deno.makeTempFile();
    await $`rm ${tempFilePath}`;
    await $`wget ${url} -O ${tempFilePath}`;
    await Deno.mkdir(language, { recursive: true });
    await $`tar xf ${tempFilePath} -C ${language}`;
    await $`rm ${tempFilePath}`;
    await $`ln -fsn ${src} ${target}`;
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

interface installer {
  install: () => Promise<void>;
  update: () => Promise<void>;
}

const builder = (
  language: string,
  server: server,
): installer | undefined => {
  const name = server.name;
  const mode = server.mode;
  const src = server.src;
  const target = server.target;
  switch (mode) {
    case "npm":
      return {
        async install() {
          await npm.install(name);
        },
        async update() {
          await npm.update(name);
        },
      };
    case "release": {
      if (!src || !target) return;
      const url = url_maker(language);
      if (!url) return;
      const install = async () => {
        await release.install(language, url, src, target);
      };
      return {
        install,
        update: install,
      };
    }
  }
};

interface server {
  name: string;
  mode: string;
  src?: string;
  target?: string;
}

const known_servers: { [lang: string]: server } = {
  lua: {
    name: "lua-language-server",
    mode: "release",
    src: "../lua/bin/lua-language-server",
    target: "bin/lua-language-server",
  },
  vim: {
    name: "vim-language-server",
    mode: "npm",
  },
  bash: {
    name: "bash-language-server",
    mode: "npm",
  },
};

const main = async () => {
  if (Deno.args.length === 0) {
    console.log("No argument");
    Deno.exit(1);
  }
  const mode = Deno.args[0];
  const installers = Deno.args.slice(1)
    .flatMap((lang) => {
      if (lang === "all") {
        return Object.entries(known_servers)
          .flatMap(([lang, server]) => builder(lang, server) || []);
      }
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

  await Deno.mkdir("bin", { recursive: true });
  Promise.all(installers.map((installer) => {
    if (mode === "install") {
      return installer.install();
    } else if (mode === "update") {
      return installer.update();
    }
  }));
};

main();
