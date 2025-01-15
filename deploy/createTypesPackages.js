// @ts-check
// node deploy/createTypesPackages.js

/**
 * @template T
 * @typedef {T extends (infer U)[] ? U : T} ArrayInner
 */
/**
 * @typedef {ArrayInner<typeof packages>} Package
 */
// prettier-ignore
export const packages = [
  {
    name: "@types/web",
    description: "Types for the DOM, and other web technologies in browsers",
    readme: "./readmes/web.md",
    files: [
      { from: "../generated/dom.generated.d.ts", to: "index.d.ts", index: true },
      { from: "../generated/dom.iterable.generated.d.ts", to: "iterable.d.ts", autoImport: true },
      { from: "../generated/ts5.5/dom.generated.d.ts", to: "ts5.5/index.d.ts", index: true, group: "ts5.5" },
      { from: "../generated/ts5.5/dom.iterable.generated.d.ts", to: "ts5.5/iterable.d.ts", autoImport: true, group: "ts5.5" },
      { from: "../generated/module/dom.generated.d.ts", to: "module/index.d.ts", group: "module" },
      { from: "../generated/module/dom.iterable.generated.d.ts", to: "module/iterable.d.ts", group: "module" },
    ],
  },
  {
    name: "@types/serviceworker",
    description: "Types for the global scope of Service Workers",
    readme: "./readmes/serviceworker.md",
    files: [
      { from: "../generated/serviceworker.generated.d.ts", to: "index.d.ts", index: true },
      { from: "../generated/serviceworker.iterable.generated.d.ts", to: "iterable.d.ts", autoImport: true },
      { from: "../generated/ts5.5/serviceworker.generated.d.ts", to: "ts5.5/index.d.ts", index: true, group: "ts5.5" },
      { from: "../generated/ts5.5/serviceworker.iterable.generated.d.ts", to: "ts5.5/iterable.d.ts", autoImport: true , group: "ts5.5" },
      { from: "../generated/module/serviceworker.generated.d.ts", to: "module/index.d.ts", group: "module" },
      { from: "../generated/module/serviceworker.iterable.generated.d.ts", to: "module/iterable.d.ts", group: "module" },
    ],
  },
  {
    name: "@types/audioworklet",
    description: "Types for the global scope of Audio Worklets",
    readme: "./readmes/audioworklet.md",
    files: [
      { from: "../generated/audioworklet.generated.d.ts", to: "index.d.ts", index: true },
      { from: "../generated/audioworklet.iterable.generated.d.ts", to: "iterable.d.ts", autoImport: true },
      { from: "../generated/ts5.5/audioworklet.generated.d.ts", to: "ts5.5/index.d.ts", index: true, group: "ts5.5" },
      { from: "../generated/ts5.5/audioworklet.iterable.generated.d.ts", to: "ts5.5/iterable.d.ts", autoImport: true , group: "ts5.5" },
      { from: "../generated/module/audioworklet.generated.d.ts", to: "module/index.d.ts", group: "module" },
      { from: "../generated/module/audioworklet.iterable.generated.d.ts", to: "module/iterable.d.ts", group: "module" },
    ],
  },
  {
    name: "@types/sharedworker",
    description: "Types for the global scope of Shared Workers",
    readme: "./readmes/sharedworker.md",
    files: [
      { from: "../generated/sharedworker.generated.d.ts", to: "index.d.ts", index: true },
      { from: "../generated/sharedworker.iterable.generated.d.ts", to: "iterable.d.ts", autoImport: true },
      { from: "../generated/ts5.5/sharedworker.generated.d.ts", to: "ts5.5/index.d.ts", index: true, group: "ts5.5" },
      { from: "../generated/ts5.5/sharedworker.iterable.generated.d.ts", to: "ts5.5/iterable.d.ts", autoImport: true, group: "ts5.5" },
      { from: "../generated/module/sharedworker.generated.d.ts", to: "module/index.d.ts", group: "module" },
      { from: "../generated/module/sharedworker.iterable.generated.d.ts", to: "module/iterable.d.ts", group: "module" },
    ],
  },
];

// Note: You can add 'version: "1.0.0"' to a package above
// to set the major or minor, otherwise it will always bump
// the patch.

import fs from "fs";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import semver from "semver";
import pkg from "prettier";
import path from "path";
const { format } = pkg;

const go = async () => {
  const generatedDir = new URL("generated/", import.meta.url);
  const templateDir = new URL("template/", import.meta.url);

  for (const pkg of packages) {
    const folderName = pkg.name.replace("@", "").replace("/", "-");
    const packagePath = new URL(`${folderName}/`, generatedDir);

    if (fs.existsSync(packagePath)) {
      await fs.promises.rm(packagePath, { recursive: true });
    }
    fs.mkdirSync(packagePath, { recursive: true });

    // Migrate in the template files
    for (const templateFile of fs.readdirSync(templateDir)) {
      if (templateFile.startsWith(".")) continue;

      const templatedFile = new URL(templateFile, templateDir);
      fs.copyFileSync(templatedFile, new URL(templateFile, packagePath));
    }

    // Add the reference files in the config above
    pkg.files.forEach((fileRef) => {
      const from = new URL(fileRef.from, import.meta.url);
      const to = new URL(fileRef.to, packagePath);
      fs.mkdirSync(new URL(".", to), { recursive: true });
      fs.copyFileSync(from, to);
    });

    prependAutoImports(pkg, packagePath);
    postProcessDTSFiles(pkg, packagePath);

    // Setup the files in the repo
    const newPkgJSON = await updatePackageJSON(pkg, packagePath);
    copyREADME(pkg, newPkgJSON, new URL("README.md", packagePath));

    // Done
    console.log("Built:", pkg.name);
  }
};

/**
 * @param {Package} pkg
 * @param {URL} packagePath
 */
async function updatePackageJSON(pkg, packagePath) {
  const pkgJSONPath = new URL("package.json", packagePath);
  const packageText = fs.readFileSync(pkgJSONPath, "utf8");
  /** @type {import("./template/package.json")} */
  const packageJSON = JSON.parse(packageText);
  packageJSON.name = pkg.name;
  packageJSON.description = pkg.description;

  // Bump the last version of the number from npm,
  // or use the _version in tsconfig if it's higher,
  // or default to 0.0.1
  let version = "0.0.1";
  try {
    const npmResponse = await fetch(
      `https://registry.npmjs.org/${packageJSON.name}`,
    );
    /** @type {*} */
    const npmPackage = await npmResponse.json();

    const semverMarkers = npmPackage["dist-tags"].latest.split(".");
    const bumpedVersion = `${semverMarkers[0]}.${semverMarkers[1]}.${
      Number(semverMarkers[2]) + 1
    }`;

    if (semver.gt(bumpedVersion, version)) {
      version = bumpedVersion;
    }
  } catch (error) {
    console.error("Caught error in grabbing version for package");
    console.error(error);
    // NOOP, this is for the first deploy, which will set it to 0.0.1
  }

  packageJSON.version = version;

  fs.writeFileSync(
    pkgJSONPath,
    await format(JSON.stringify(packageJSON), {
      filepath: fileURLToPath(pkgJSONPath),
    }),
  );

  return packageJSON;
}

/**
 * Copies the README and adds some rudimentary templating to the file.
 * @param {Package} pkg
 * @param {import("./template/package.json")} pkgJSON
 * @param {URL} writePath
 */
function copyREADME(pkg, pkgJSON, writePath) {
  let readme = fs.readFileSync(new URL(pkg.readme, import.meta.url), "utf-8");

  const htmlEncodedTag =
    encodeURIComponent(pkgJSON.name) + "%40" + pkgJSON.version;

  readme = readme
    .replace("{{version}}", pkgJSON.version)
    .replace(
      "{{release_href}}",
      `https://github.com/microsoft/TypeScript-DOM-lib-generator/releases/tag/${htmlEncodedTag}`,
    );

  fs.writeFileSync(writePath, readme);
}

/**
 * Appends any files marked as autoImport in the metadata.
 * @param {Package} pkg
 * @param {URL} packagePath
 */
function prependAutoImports(pkg, packagePath) {
  /**
   * @type {Map<string | undefined, typeof pkg.files[number][]>}
   */
  const groups = new Map();
  for (const file of pkg.files) {
    let files = groups.get(file.group);
    if (!files) groups.set(file.group, (files = []));
    files.push(file);
  }
  for (const files of groups.values()) {
    const indexFile = files.find((file) => file.index);
    if (!indexFile) continue;

    const index = new URL(indexFile.to, packagePath);
    if (!fs.existsSync(index)) continue;

    const toPrepend = files
      .filter((f) => !!f.autoImport)
      .map((f) => relativeUrl(index, new URL(f.to, packagePath)))
      .map((f) => `/// <reference path="${f}" />`)
      .join("\n");

    if (toPrepend) {
      const indexText = fs.readFileSync(index, "utf-8");
      fs.writeFileSync(index, `${toPrepend}\n\n${indexText}`);
    }
  }
}

/**
 * @param {URL} from
 * @param {URL} to
 */
function relativeUrl(from, to) {
  if (from.origin !== to.origin) return to.toString();
  if (!from.pathname.endsWith("/")) from = new URL("./", from);
  const relative = path.posix.relative(from.pathname, to.pathname);
  return path.isAbsolute(relative) ||
    relative.startsWith("../") ||
    relative.startsWith("./")
    ? relative
    : `./${relative}`;
}

/**
 * Handles any post-processing we do for deployment.
 * @param {Package} pkg
 * @param {URL} packagePath
 */
export function postProcessDTSFiles(pkg, packagePath) {
  iterateThroughFiles((content) => {
    return content.replace(
      "abort(reason?: any): AbortSignal;",
      "// abort(reason?: any): AbortSignal; - To be re-added in the future",
    );
  });

  /** @param {(str:string) => string} contentReplacer */
  function iterateThroughFiles(contentReplacer) {
    pkg.files.forEach((fileRef) => {
      const dtsFileURL = new URL(fileRef.to, packagePath);
      let dtsContent = fs.readFileSync(dtsFileURL, "utf-8");
      dtsContent = contentReplacer(dtsContent);
      fs.writeFileSync(dtsFileURL, dtsContent);
    });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await go();
}
