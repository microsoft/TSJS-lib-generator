import * as fs from "fs";
import child_process from "child_process";
import { printUnifiedDiff } from "print-diff";
import { fileURLToPath } from "url";
import path from "path";

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

function compileGeneratedFiles(lib: string, folder: URL, ...files: string[]) {
  try {
    console.log("Testing:");
    console.log("\tlib:", lib);
    console.log(
      "\tfolder:",
      path.relative(fileURLToPath(import.meta.url), fileURLToPath(folder)),
    );
    console.log("\tfiles:", files.join(","));

    child_process.execSync(
      `node ${fileURLToPath(
        tscPath,
      )} --strict --lib ${lib} --types --noEmit ${files
        .map((file) => fileURLToPath(new URL(file, folder)))
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
    [
      outputFolder,
      new URL("ts5.5", outputFolder),
      new URL("modules", outputFolder),
    ].reduce((result, folder) => {
      return (
        result &&
        compileGeneratedFiles("es5", folder, "dom.generated.d.ts") &&
        compileGeneratedFiles(
          "es6",
          folder,
          "dom.generated.d.ts",
          "dom.iterable.generated.d.ts",
        ) &&
        compileGeneratedFiles(
          "es2018",
          folder,
          "dom.generated.d.ts",
          "dom.asynciterable.generated.d.ts",
        ) &&
        compileGeneratedFiles("es5", folder, "webworker.generated.d.ts") &&
        compileGeneratedFiles(
          "es6",
          folder,
          "webworker.generated.d.ts",
          "webworker.iterable.generated.d.ts",
        ) &&
        compileGeneratedFiles(
          "es2018",
          folder,
          "webworker.generated.d.ts",
          "webworker.asynciterable.generated.d.ts",
        ) &&
        compileGeneratedFiles("es5", folder, "sharedworker.generated.d.ts") &&
        compileGeneratedFiles(
          "es6",
          folder,
          "sharedworker.generated.d.ts",
          "sharedworker.iterable.generated.d.ts",
        ) &&
        compileGeneratedFiles(
          "es2018",
          folder,
          "sharedworker.generated.d.ts",
          "sharedworker.asynciterable.generated.d.ts",
        ) &&
        compileGeneratedFiles("es5", folder, "serviceworker.generated.d.ts") &&
        compileGeneratedFiles(
          "es6",
          folder,
          "serviceworker.generated.d.ts",
          "serviceworker.iterable.generated.d.ts",
        ) &&
        compileGeneratedFiles(
          "es2018",
          folder,
          "serviceworker.generated.d.ts",
          "serviceworker.asynciterable.generated.d.ts",
        ) &&
        compileGeneratedFiles("es5", folder, "audioworklet.generated.d.ts") &&
        compileGeneratedFiles(
          "es6",
          folder,
          "audioworklet.generated.d.ts",
          "audioworklet.iterable.generated.d.ts",
        ) &&
        compileGeneratedFiles(
          "es2018",
          folder,
          "audioworklet.generated.d.ts",
          "audioworklet.asynciterable.generated.d.ts",
        )
      );
    }, true)
  ) {
    console.log("All tests passed.");
    process.exit(0);
  }
  process.exit(1);
}

test();
