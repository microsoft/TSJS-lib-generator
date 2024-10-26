import * as fs from "fs";
import child_process from "child_process";
import { printUnifiedDiff } from "print-diff";
import { fileURLToPath } from "url";

const baselineFolder = new URL("../baselines/", import.meta.url);
const outputFolder = new URL("../generated/", import.meta.url);
const tscPath = new URL(
  "../node_modules/typescript/lib/tsc.js",
  import.meta.url,
);

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function compareToBaselines(baselineFolder: URL, outputFolder: URL) {
  let baselineFiles: string[] = [];
  try {
    baselineFiles = fs.readdirSync(baselineFolder);
  } catch {
    // do nothing
  }

  let outputFiles: string[] = [];
  try {
    outputFiles = fs.readdirSync(outputFolder);
  } catch {
    // do nothing
  }

  for (const file of new Set([...baselineFiles, ...outputFiles])) {
    if (file.startsWith(".")) {
      continue;
    }

    let baselineStats: fs.Stats | undefined;
    try {
      baselineStats = fs.statSync(new URL(file, baselineFolder));
    } catch {
      // do nothing
    }

    let outputStats: fs.Stats | undefined;
    try {
      outputStats = fs.statSync(new URL(file, outputFolder));
    } catch {
      // do nothing
    }

    const baseline = baselineStats?.isFile()
      ? normalizeLineEndings(
          fs.readFileSync(new URL(file, baselineFolder)).toString(),
        )
      : null;

    const generated = outputStats?.isFile()
      ? normalizeLineEndings(
          fs.readFileSync(new URL(file, outputFolder)).toString(),
        )
      : null;

    if (baseline !== null || generated !== null) {
      if (baseline !== generated) {
        console.error(
          `Test failed: '${file}' is different from baseline file.`,
        );
        printUnifiedDiff(baseline ?? "", generated ?? "");
        return false;
      }

      continue;
    }

    if (baselineStats?.isDirectory() || outputStats?.isDirectory()) {
      const childBaselineFolder = new URL(`${file}/`, baselineFolder);
      const childOutputFolder = new URL(`${file}/`, outputFolder);
      if (!compareToBaselines(childBaselineFolder, childOutputFolder)) {
        return false;
      }

      continue;
    }
  }
  return true;
}

function compileGeneratedFiles(lib: string, ...files: string[]) {
  try {
    child_process.execSync(
      `node ${fileURLToPath(
        tscPath,
      )} --strict --lib ${lib} --types --noEmit ${files
        .map((file) => fileURLToPath(new URL(file, outputFolder)))
        .join(" ")}`,
    );
  } catch (e: any) {
    console.error(`Test failed: could not compile '${files.join(",")}':`);
    console.error(e.stdout.toString());
    console.error();
    return false;
  }
  return true;
}

function test() {
  if (
    compareToBaselines(baselineFolder, outputFolder) &&
    compileGeneratedFiles("es5", "dom.generated.d.ts") &&
    compileGeneratedFiles(
      "es6",
      "dom.generated.d.ts",
      "dom.tostringtag.generated.d.ts",
      "dom.iterable.generated.d.ts",
    ) &&
    compileGeneratedFiles(
      "es2018",
      "dom.generated.d.ts",
      "dom.tostringtag.generated.d.ts",
      "dom.asynciterable.generated.d.ts",
    ) &&
    compileGeneratedFiles("es5", "webworker.generated.d.ts") &&
    compileGeneratedFiles(
      "es6",
      "webworker.generated.d.ts",
      "webworker.tostringtag.generated.d.ts",
      "webworker.iterable.generated.d.ts",
    ) &&
    compileGeneratedFiles(
      "es2018",
      "webworker.generated.d.ts",
      "webworker.tostringtag.generated.d.ts",
      "webworker.asynciterable.generated.d.ts",
    ) &&
    compileGeneratedFiles("es5", "sharedworker.generated.d.ts") &&
    compileGeneratedFiles(
      "es6",
      "sharedworker.generated.d.ts",
      "sharedworker.tostringtag.generated.d.ts",
      "sharedworker.iterable.generated.d.ts",
    ) &&
    compileGeneratedFiles(
      "es2018",
      "sharedworker.generated.d.ts",
      "sharedworker.tostringtag.generated.d.ts",
      "sharedworker.asynciterable.generated.d.ts",
    ) &&
    compileGeneratedFiles("es5", "serviceworker.generated.d.ts") &&
    compileGeneratedFiles(
      "es6",
      "serviceworker.generated.d.ts",
      "serviceworker.tostringtag.generated.d.ts",
      "serviceworker.iterable.generated.d.ts",
    ) &&
    compileGeneratedFiles(
      "es2018",
      "serviceworker.generated.d.ts",
      "serviceworker.tostringtag.generated.d.ts",
      "serviceworker.asynciterable.generated.d.ts",
    ) &&
    compileGeneratedFiles("es5", "audioworklet.generated.d.ts") &&
    compileGeneratedFiles(
      "es6",
      "audioworklet.generated.d.ts",
      "audioworklet.tostringtag.generated.d.ts",
      "audioworklet.iterable.generated.d.ts",
    ) &&
    compileGeneratedFiles(
      "es2018",
      "audioworklet.generated.d.ts",
      "audioworklet.tostringtag.generated.d.ts",
      "audioworklet.asynciterable.generated.d.ts",
    )
  ) {
    console.log("All tests passed.");
    process.exit(0);
  }
  process.exit(1);
}

test();
