import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// esbuild 只打包入口文件；这些通过 __dirname 读取的运行时资源需要单独复制。
await rm(join(root, "lib", "assets"), { recursive: true, force: true });
await mkdir(join(root, "lib"), { recursive: true });
await cp(join(root, "src", "assets"), join(root, "lib", "assets"), {
  recursive: true,
  force: true,
});
await cp(
  join(root, "src", "emptyHtml.html"),
  join(root, "lib", "emptyHtml.html"),
  {
    force: true,
  },
);

console.log("copied assets and emptyHtml.html to lib/");
