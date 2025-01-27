### `@types/serviceworker` - Types for the global scope of Service Workers

> Service workers essentially act as proxy servers that sit between web applications, the browser, and the network (when available). They are intended, among other things, to enable the creation of effective offline experiences, intercept network requests and take appropriate action based on whether the network is available, and update assets residing on the server. They will also allow access to push notifications and background sync APIs.

From [MDN Web Docs: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

This package contains type definitions which will set up the global environment for your TypeScript project to match the runtime environment of a Service Worker. The APIs inside `@types/serviceworker` are [generated from](https://github.com/microsoft/TypeScript-DOM-lib-generator/) the specifications for JavaScript. Given the size and state of constant change in web browsers, `@types/serviceworker` only has APIs which have passed a certain level of standardization and are available in at least two of the most popular browser engines.

## Installation 

To use `@types/serviceworker` you need to do two things:

1. Install the dependency: `npm install @types/serviceworker --save-dev`, `yarn add @types/serviceworker --dev` or `pnpm add @types/serviceworker --dev`.
1. Update your [`tsconfig.json`](https://www.typescriptlang.org/tsconfig) to avoid clashing with the DOM APIs. There are two cases to consider depending on if you have `lib` defined in your `tsconfig.json` or not.

    1. **Without "lib"** - You will need to add `"lib": []`. The value you want to add inside your lib should correlate to your [`"target"`](https://www.typescriptlang.org/tsconfig#target). For example if you had `"target": "es2017"`, then you would add `"lib": ["es2017"]`
    1. **With "lib"**  - You should remove `"dom"`.

That's all. 

If you'd like to ensure that the DOM types are never accidentally included, you can use [@orta/types-noop](https://www.npmjs.com/package/@orta/type-noops) in TypeScript 4.5+.

## Importing types as a module

This package also features a module entrypoint, enabling imports of types without pollution of the global namespace:

```typescript
import type { ServiceWorker } from "serviceworker/module";

function printScriptUrl(worker: ServiceWorker) {
  console.log(worker.scriptURL);
}
```

## SemVer

This project does not respect semantic versioning as almost every change could potentially break a project, though we try to minimize removing types.

`@types/serviceworker` follow the specifications, so when they mark a function/object/API/type as deprecated or removed - that is respected.

## Deploy Metadata

You can read what changed in version {{version}} at {{release_href}}.