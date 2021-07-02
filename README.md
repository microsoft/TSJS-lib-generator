# TypeScript and JavaScript lib generator

This tool is used to generate the web-based `lib.dom.d.ts` file which is included with TypeScript releases, and as the `@types/web` package.

## Why is my fancy API still not available here?

A feature needs to be supported by more than two major browser engines to be included here, to make sure there is a good consensus among vendors: __Gecko__ (Firefox), __Blink__ (Chrome/Edge), and __WebKit__ (Safari).

If the condition is met but still is not available here, please [file an issue](hthttps://github.com/microsoft/TypeScript-DOM-lib-generator/issues/new).

## Build Instructions

To get things setup:

```sh
npm install
```

To generate the `.d.ts` files

```sh
npm run build
```

To test:

```sh
npm run test
```

To deploy:

```sh
npm run migrate
```

The script will look in for a clone of the TypeScript repo in "../TypeScript", or "./TypeScript" to move the generated files in. 

## Contribution Guidelines

The `dom.generated.d.ts`, `webworker.generated.d.ts` and `dom.iterable.generated.d.ts` files from the TypeScript repo are used as baselines.
For each pull request, we will run the script and compare the generated files with the baseline files.
In order to make the tests pass, please update the baseline as well in any pull requests.

It's recommended to first check which spec the wrong type belongs to. Say we are to update `IntersectionObserver` which belongs to [`Intersection Observer`](https://www.w3.org/TR/intersection-observer/) spec, and then we can do:

1. First check we have the spec name `Intersection Observer` in `inputfiles/idlSources.json`. If not, add it.
2. Run `npm run fetch-idl "Intersection Observer" && npm run build && npm run baseline-accept`.

If the above didn't fix the type issues, we can fix them via json files as a last resort.
There are three json files that are typically used to alter the type generation: `addedTypes.json`, `overridingTypes.json`, and `removedTypes.json`.
`comments.json` can used to add comments to the types.
Finally, `knownTypes.json` determine which types are available in a certain environment in case it couldn't be automatically determined.

The format of each file can be inferred from their existing content.

The common steps to send a pull request are:

0. Open or refer to an issue in the [TypeScript repo](https://github.com/Microsoft/TypeScript) which might get moved back to this repo.
1. Update an IDL or add missing elements to `inputfiles/addedTypes.json`, overriding elements to `inputfiles/overridingTypes.json`, or elements to remove to `inputfiles/removedTypes.json`.
2. Run the build script locally to obtain new `dom.generated.d.ts` and `webworker.generated.d.ts`.
3. Update the files in the `baselines` folder using the newly generated files under `generated` folder (`npm run baseline-accept`).

### What are the TypeScript team's heuristics for PRs to the DOM APIs

Changes to this repo can have pretty drastic ecosystem effects, because these types are included by default in TypeScript.
Due to this, we tend to be quite conservative with our approach to introducing changes.
To give you a sense of whether we will accept changes, you can use these heuristics to know up-front if we'll be open to merging.

#### Fixes

> For example, changing a type on a field, or nullability references

- Does the PR show examples of the changes being used in spec examples or reputable websites like MDN?
- Did this change come from an IDL update?
- Does the change appear to be high-impact on a well-used API?
- Would the changes introduce a lot of breaking changes to existing code? For example the large corpus of typed code in DefinitelyTyped.

#### Additions

> For example, adding a new spec or subsection via a new or updated IDL file

- Does the new objects or fields show up in [mdn/browser-compat-data](https://github.com/mdn/browser-compat-data)? If not, it's likely too soon.
- Is the IDL source from WHATWG?
    - Are the additions available in at least two of [Firefox](https://searchfox.org/mozilla-central/search?q=&path=), [Safari](https://webkit-search.igalia.com/webkit/search?q=&path=) and Chromium?
- Is the IDL source from W3C?
    - What stage of the [W3C process](https://en.wikipedia.org/wiki/World_Wide_Web_Consortium#Specification_maturation) is the proposal for these changes: We aim for Proposed recommendation, but can accept Candidate recommendation for stable looking proposals.
    - If it's at Working draft the additions available in all three of Firefox, Safari and Chromium
- Could any types added at the global scope have naming conflicts?
- Are the new features going to be used by a lot of people?

#### Removals

> For example, removing a browser-specific section of code

- Do the removed objects or fields show up in [mdn/browser-compat-data](https://github.com/mdn/browser-compat-data)? If so, are they marked as deprecated?
- Does an internet search for the fields show results in blogs/recommendations?
- When was the deprecation (this can be hard to find) but was it at least 2 years ago if so?

## Build Instructions

# This repo

## Code Structure

- `src/index.ts`: handles the emitting of the `.d.ts` files.
- `src/test.ts`: verifies the output by comparing the `generated/` and `baseline/` contents.

## Input Files

- `browser.webidl.preprocessed.json`: a JSON file generated by Microsoft Edge. **Do not edit this file**.
    - Due to the different update schedules between Edge and TypeScript, this may not be the most up-to-date version of the spec.
- `mdn/apiDescriptions.json`: a JSON file generated by fetching API descriptions from [MDN](https://developer.mozilla.org/en-US/docs/Web/API). **Do not edit this file**.
- `addedTypes.json`: types that should exist in either browser or webworker but are missing from the Edge spec. The format of the file mimics that of `browser.webidl.preprocessed.json`.
- `overridingTypes.json`: types that are defined in the spec file but has a better or more up-to-date definitions in the json files.
- `removedTypes.json`: types that are defined in the spec file but should be removed.
- `comments.json`: comment strings to be embedded in the generated .js files.
- `deprecatedMessage.json`: the reason why one type is deprecated. The reason why it is a separate file rather than merge in comment.json is mdn/apiDescriptions.json would also possibly be deprecated.
