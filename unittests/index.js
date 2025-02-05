import { execSync } from "child_process";
import { readdir } from "fs/promises";

for (const filename of await readdir(new URL("files/", import.meta.url))) {
  if (filename.endsWith(".ts")) {
    execSync(
      `npx tsc generated/dom.generated.d.ts unittests/files/${filename} --strict --strictNullChecks --target es2020 --lib es2020 --types --noEmit`,
      {
        stdio: "inherit",
      }
    );
  }
}

for (const filename of await readdir(
  new URL("files/audioworklet", import.meta.url)
)) {
  if (filename.endsWith(".ts")) {
    execSync(
      `npx tsc generated/audioworklet.generated.d.ts unittests/files/audioworklet/${filename} --strict --strictNullChecks --target es2020 --lib es2020 --types --noEmit`,
      {
        stdio: "inherit",
      }
    );
  }
}
