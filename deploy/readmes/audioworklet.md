### `@types/audioworklet` - Types for the global scope of Audio Worklets

> The AudioWorklet interface of the Web Audio API is used to supply custom audio processing scripts that execute in a separate thread to provide very low latency audio processing. The worklet's code is run in the AudioWorkletGlobalScope global execution context, using a separate Web Audio thread which is shared by the worklet and other audio nodes.

From [MDN Web Docs: AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)

This package contains type definitions which will set up the global environment for your TypeScript project to match the runtime environment of an Audio Worklet. The APIs inside `@types/audioworklet` are [generated from](https://github.com/microsoft/TypeScript-DOM-lib-generator/) the specifications for [Web Audio](https://webaudio.github.io/web-audio-api/).

## Installation 

To use `@types/audioworklet` you need to do two things:

1. Install the dependency: `npm install @types/audioworklet --save-dev`, `yarn add @types/audioworklet --dev` or `pnpm add @types/audioworklet --dev`.
1. Update your [`tsconfig.json`](https://www.typescriptlang.org/tsconfig) to avoid clashing with the DOM APIs. There are two cases to consider depending on if you have `lib` defined in your `tsconfig.json` or not.

    1. **Without "lib"** - You will need to add `"lib": []`. The value you want to add inside your lib should correlate to your [`"target"`](https://www.typescriptlang.org/tsconfig#target). For example if you had `"target": "es2017"`, then you would add `"lib": ["es2017"]`
    1. **With "lib"**  - You should remove `"dom"`.

That's all. 

If you'd like to ensure that the DOM types are never accidentally included, you can use [@orta/types-noop](https://www.npmjs.com/package/@orta/type-noops) in TypeScript 4.5+.

## Importing types as a module

This package also features a module entrypoint, enabling imports of types without pollution of the global namespace:

```typescript
import type { AudioWorkletProcessor } from "audioworklet/module";

function printPort(processor: AudioWorkletProcessor) {
  console.log(processor.port);
}
```

## SemVer

This project does not respect semantic versioning as almost every change could potentially break a project, though we try to minimize removing types.

`@types/audioworklet` follow the specifications, so when they mark a function/object/API/type as deprecated or removed - that is respected.

## Deploy Metadata

You can read what changed in version {{version}} at {{release_href}}.