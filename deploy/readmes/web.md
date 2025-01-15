### `@types/web` - Types for the DOM and most web-related APIs

This module contains the DOM types for the majority of the web APIs used in a web browser. 

The APIs inside `@types/web` are [generated from](https://github.com/microsoft/TypeScript-DOM-lib-generator/) the specifications for CSS, HTML and JavaScript. Given the size and state of constant change in web browsers, `@types/web` only has APIs which have passed a certain level of standardization and are available in at least two of the most popular browser engines. 
 
`@types/web` is also included inside TypeScript, available as `dom` in the [`lib`](https://www.typescriptlang.org/tsconfig#lib) section and included in projects by default. By using `@types/web` you can lock your the web APIs used in your projects, easing the process of updating TypeScript and offering more control in your environment. 

## Installation 

With TypeScript 4.5+ using [lib replacement](https://github.com/microsoft/TypeScript/pull/45771), you can swap the DOM lib with this dependency:

```sh
pnpm add @typescript/lib-dom@npm:@types/web --save-dev
npm install @typescript/lib-dom@npm:@types/web --save-dev
yarn add @typescript/lib-dom@npm:@types/web --dev
```

That's all. 

<details>
<summary>TypeScript 4.4 and below</summary>

<br/>
To use `@types/web` you need to do two things:

1. Install the dependency: `npm install @types/web --save-dev`, `yarn add @types/web --dev` or `pnpm add @types/web --dev`.

1. Update your [`tsconfig.json`](https://www.typescriptlang.org/tsconfig). There are two cases to consider depending on if you have `lib` defined in your `tsconfig.json` or not.

    1. **Without "lib"** - You will need to add `"lib": []`. The value you want to add inside your lib should correlate to your [`"target"`](https://www.typescriptlang.org/tsconfig#target). For example if you had `"target": "es2017"`, then you would add `"lib": ["es2017"]`
    1. **With "lib"**  - You should remove `"dom"`.

Removing `"dom"` gives @types/web the chance to provide the same set of global declarations. However, It's possible that your dependencies pull in the TypeScript DOM library, in which case you can either try to make that not happen, or use TypeScript 4.5 to systematically replace the library.

</details>

## Importing types as a module

This package also features a module entrypoint, enabling imports of types without pollution of the global namespace:

```typescript
import type { Window } from "web/module";

function printLocation(window: Window) {
  console.log(window.location.href);
}
```

## SemVer

This project does not respect semantic versioning as almost every change could potentially break a project, though we try to minimize removing types. 
`@types/web` follow the specifications, so when they mark a function/object/API/type as deprecated or removed - that is respected.

## TypeScript Version Support

Prior to `@types/web` the web APIs were deployed with a version of TypeScript, and backwards compatibility has not been a concern. Now the web APIs and TypeScript can be de-coupled, then we expect to eventually hit a point where we take backwards compatibility in mind. For now, `@types/web` officially supports TypeScript 4.4 and above. It very likely will work with TypeScript versions much earlier that that however.

## Deploy Metadata

You can read what changed in version {{version}} at {{release_href}}.