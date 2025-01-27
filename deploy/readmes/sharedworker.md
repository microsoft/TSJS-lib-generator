### `@types/sharedworker` - Types for the global scope of Web Workers

> The SharedWorker interface represents a specific kind of worker that can be accessed from several browsing contexts, such as several windows, iframes or even workers. They implement an interface different than dedicated workers and have a different global scope, `SharedWorkerGlobalScope`.

From [MDN Web Docs: SharedWorker API](https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker)

This package contains type definitions which will set up the global environment for your TypeScript project to match the runtime environment of a Web Worker. The APIs inside `@types/sharedworker` are [generated from](https://github.com/microsoft/TypeScript-DOM-lib-generator/) the specifications for JavaScript.

## Installation 

To use `@types/sharedworker` you need to do two things:

1. Install the dependency: `npm install @types/sharedworker --save-dev`, `yarn add @types/sharedworker --dev` or `pnpm add @types/sharedworker --dev`.

1. Update your [`tsconfig.json`](https://www.typescriptlang.org/tsconfig) to avoid clashing with the DOM APIs. There are two cases to consider depending on if you have `lib` defined in your `tsconfig.json` or not.

    1. **Without "lib"** - You will need to add `"lib": []`. The value you want to add inside your lib should correlate to your [`"target"`](https://www.typescriptlang.org/tsconfig#target). For example if you had `"target": "es2017"`, then you would add `"lib": ["es2017"]`
    1. **With "lib"**  - You should remove `"dom"`.


If you'd like to ensure that the DOM types are never accidentally included, you can use [@orta/types-noop](https://www.npmjs.com/package/@orta/type-noops) in TypeScript 4.5+.

## Importing types as a module

This package also features a module entrypoint, enabling imports of types without pollution of the global namespace:

```typescript
import type { SharedWorkerGlobalScope } from "sharedworker/module";

function printName(scope: SharedWorkerGlobalScope) {
  console.log(scope.name);
}
```

## SemVer

This project does not respect semantic versioning as almost every change could potentially break a project, though we try to minimize removing types.

`@types/sharedworker` follow the specifications, so when they mark a function/object/API/type as deprecated or removed - that is respected.

## Deploy Metadata

You can read what changed in version {{version}} at {{release_href}}.