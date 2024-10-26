import * as Browser from "./types.js";
import {
  mapToArray,
  distinct,
  mapValues,
  toNameMap,
  mapDefined,
  arrayToMap,
  integerTypes,
  baseTypeConversionMap,
  assertUnique,
} from "./helpers.js";
import { collectLegacyNamespaceTypes } from "./legacy-namespace.js";

/// Decide which members of a function to emit
enum EmitScope {
  StaticOnly,
  InstanceOnly,
  All,
}

const tsKeywords = new Set(["default", "delete", "continue"]);
const extendConflictsBaseTypes: Record<
  string,
  { extendType: string[]; memberNames: Set<string> }
> = {
  HTMLCollection: {
    extendType: ["HTMLFormControlsCollection"],
    memberNames: new Set(["namedItem"]),
  },
};

// Namespaces that have been in form of interfaces for years
// and can't be converted to namespaces without breaking type packages
const namespacesAsInterfaces = ["console"];

// Used to decide if a member should be emitted given its static property and
// the intended scope level.
function matchScope(scope: EmitScope, x: { static?: boolean }) {
  return (
    scope === EmitScope.All || (scope === EmitScope.StaticOnly) === !!x.static
  );
}

/// Parameter cannot be named "default" in JavaScript/Typescript so we need to rename it.
function adjustParamName(name: string) {
  return tsKeywords.has(name) ? `_${name}` : name;
}

function getElements<K extends string, T>(
  a: Record<K, Record<string, T>> | undefined,
  k: K,
): T[] {
  return a ? mapToArray(a[k]) : [];
}

function createTextWriter(newLine: string) {
  let output: string;
  let indent: number;
  let lineStart: boolean;
  /** print declarations conflicting with base interface to a side list to write them under a different name later */
  let stack: { content: string; indent: number }[] = [];

  function getIndentString(level: number) {
    return "    ".repeat(level);
  }

  function write(s: string) {
    if (s && lineStart) {
      output += getIndentString(indent);
      lineStart = false;
    }
    output += s;
  }

  function reset(): void {
    output = "";
    indent = 0;
    lineStart = true;
    stack = [];
  }

  function endLine() {
    output += newLine;
    lineStart = true;
  }

  reset();

  return {
    reset,

    increaseIndent() {
      indent++;
    },
    decreaseIndent() {
      indent--;
    },

    endLine,
    print: write,
    printLine(c: string) {
      write(c);
      endLine();
    },

    clearStack() {
      stack = [];
    },
    stackIsEmpty() {
      return stack.length === 0;
    },
    printLineToStack(content: string) {
      stack.push({ content, indent });
    },
    printStackContent() {
      stack.forEach((e) => {
        const oldIndent = indent;
        indent = e.indent;
        this.printLine(e.content);
        indent = oldIndent;
      });
    },

    getResult() {
      return output;
    },
  };
}

function isEventHandler(p: Browser.Property) {
  return typeof p.eventHandler === "string";
}

export function emitWebIdl(
  webidl: Browser.WebIdl,
  global: string,
  flavor: "" | "iterator" | "asyncIterator" | "toStringTag",
  useIteratorObject: boolean,
): string {
  // Global print target
  const printer = createTextWriter("\n");

  const polluter = getElements(webidl.interfaces, "interface").find(
    (i) => !!i.global,
  );

  const allNonCallbackInterfaces = getElements(
    webidl.interfaces,
    "interface",
  ).concat(getElements(webidl.mixins, "mixin"));
  const allInterfaces = getElements(webidl.interfaces, "interface").concat(
    getElements(webidl.callbackInterfaces, "interface"),
    getElements(webidl.mixins, "mixin"),
  );

  const allInterfacesMap = toNameMap(allInterfaces);
  const allLegacyWindowAliases = allInterfaces.flatMap(
    (i) => i.legacyWindowAlias,
  );
  const allDictionariesMap = webidl.dictionaries?.dictionary ?? {};
  const allEnumsMap = webidl.enums ? webidl.enums.enum : {};
  const allCallbackFunctionsMap =
    webidl.callbackFunctions?.callbackFunction ?? {};
  const allTypedefsMap = toNameMap(webidl.typedefs?.typedef ?? []);

  /// Tag name to element name map
  const tagNameToEleName = getTagNameToElementNameMap();
  const tagNameMapNames = [
    "HTMLElementTagNameMap",
    "SVGElementTagNameMap",
    "MathMLElementTagNameMap",
  ];

  /// Interface name to all its implemented / inherited interfaces name list map
  /// e.g. If i1 depends on i2, i2 should be in dependencyMap.[i1.Name]
  const iNameToIDependList = arrayToMap(
    allNonCallbackInterfaces,
    (i) => i.name,
    (i) => getExtendList(i.name).concat(getImplementList(i.name)),
  );

  /// Distinct event type list, used in the "createEvent" function
  const distinctETypeList = distinct(
    allNonCallbackInterfaces
      .flatMap((i) => (i.events ? i.events.event.map((e) => e.type) : []))
      .concat(
        allNonCallbackInterfaces
          .filter(
            (i) => i.extends?.endsWith("Event") && i.name.endsWith("Event"),
          )
          .map((i) => i.name),
      ),
  ).sort();

  /// Interface name to its related eventhandler name list map
  /// Note:
  /// In the xml file, each event handler has
  /// 1. eventhandler name: "onready", "onabort" etc.
  /// 2. the event name that it handles: "ready", "SVGAbort" etc.
  /// And they don't just differ by an "on" prefix!
  const iNameToEhList = arrayToMap(
    allInterfaces,
    (i) => i.name,
    (i) => {
      const fromProperties = mapDefined(
        mapToArray(i.properties?.property),
        (p) => p.eventHandler,
      );
      const fromEvents = (i.events?.event ?? []).map((e) => e.name);
      return distinct([...fromProperties, ...fromEvents]).sort();
    },
  );

  const iNameToConstList = arrayToMap(
    allInterfaces,
    (i) => i.name,
    (i) => (!i.constants ? [] : mapToArray(i.constants.constant)),
  );

  // Map of interface.Name -> List of base interfaces with event handlers
  const iNameToEhParents = arrayToMap(
    allInterfaces,
    (i) => i.name,
    getParentsWithEventHandler,
  );

  const iNameToConstParents = arrayToMap(
    allInterfaces,
    (i) => i.name,
    getParentsWithConstant,
  );

  switch (flavor) {
    case "toStringTag":
      return emitES6ToStringTag();
    case "iterator":
      return emitES6DomIterators();
    case "asyncIterator":
      return emitES2018DomAsyncIterators();
    default:
      return emit();
  }

  function getTagNameToElementNameMap() {
    const htmlResult: Record<string, string> = {};
    const htmlDeprecatedResult: Record<string, string> = {};
    const svgResult: Record<string, string> = {};
    const mathMLResult: Record<string, string> = {};
    for (const i of allNonCallbackInterfaces) {
      if (i.element) {
        for (const e of i.element) {
          if (e.namespace === "SVG") {
            svgResult[e.name] = i.name;
          } else if (e.namespace === "MathML") {
            mathMLResult[e.name] = i.name;
          } else if (e.deprecated || i.deprecated) {
            htmlDeprecatedResult[e.name] = i.name;
          } else {
            htmlResult[e.name] = i.name;
          }
        }
      }
    }
    return { htmlResult, htmlDeprecatedResult, svgResult, mathMLResult };
  }

  function getExtendList(iName: string): string[] {
    const i = allInterfacesMap[iName];
    if (!i || !i.extends || i.extends === "Object") return [];
    else return getExtendList(i.extends).concat(i.extends);
  }

  function getImplementList(iName: string) {
    const i = allInterfacesMap[iName];
    return i?.implements?.sort() || [];
  }

  function getParentsWithEventHandler(
    i: Browser.Interface,
  ): Browser.Interface[] {
    function getParentEventHandler(i: Browser.Interface): Browser.Interface[] {
      const hasEventListener = iNameToEhList[i.name]?.length;
      if (hasEventListener) {
        return [i];
      }
      const ehParents = getParentsWithEventHandler(i);
      if (ehParents.length > 1) {
        return [i];
      }
      return ehParents;
    }

    if (!i.extends) {
      return [];
    }

    const iExtends = i.extends?.replace(/<.*>$/, "") || "";
    const parentWithEventHandler =
      (allInterfacesMap[iExtends] &&
        getParentEventHandler(allInterfacesMap[iExtends])) ||
      [];
    const mixinsWithEventHandler = getImplementList(i.name).flatMap((i) =>
      getParentEventHandler(allInterfacesMap[i]),
    );

    return distinct(parentWithEventHandler.concat(mixinsWithEventHandler));
  }

  function getParentsWithConstant(i: Browser.Interface) {
    function getParentConstant(i: Browser.Interface): Browser.Interface[] {
      const hasConst = iNameToConstList[i.name]?.length;
      return (hasConst ? [i] : []).concat(getParentsWithConstant(i));
    }

    const mixinsWithConstant = getImplementList(i.name).flatMap((i) =>
      getParentConstant(allInterfacesMap[i]),
    );

    return distinct(mixinsWithConstant);
  }

  function getEventTypeInInterface(eName: string, i: Browser.Interface) {
    function getGenericEventType(baseName: string) {
      if (baseName === "ProgressEvent" && !i.mixin) {
        return `${baseName}<${i.name}>`;
      }
      return baseName;
    }

    if (i.events) {
      const event = i.events.event.find((e) => e.name === eName);
      if (event?.type) {
        return getGenericEventType(event.type);
      }
    }
    if (i.attributelessEvents) {
      const event = i.attributelessEvents.event.find((e) => e.name === eName);
      if (event?.type) {
        return getGenericEventType(event.type);
      }
    }

    const event = webidl.events?.get(i.name)?.get(eName);
    if (event && allInterfacesMap[event]) {
      return getGenericEventType(event);
    }
    return "Event";
  }

  /// Get typescript type using object dom type, object name, and it's associated interface name
  function convertDomTypeToTsType(obj: Browser.Typed): string {
    if (obj.overrideType) {
      return obj.nullable ? makeNullable(obj.overrideType) : obj.overrideType;
    }
    if (!obj.type)
      throw new Error("Missing 'type' field in " + JSON.stringify(obj));
    const type = convertDomTypeToTsTypeWorker(obj);
    return obj.nullable ? makeNullable(type) : type;
  }

  function convertDomTypeToTsReturnType(obj: Browser.Typed): string {
    const type = convertDomTypeToTsType(obj);
    if (type === "undefined") {
      return "void";
    }
    if (type === "Promise<undefined>") {
      return "Promise<void>";
    }
    if (type === "undefined | PromiseLike<undefined>") {
      return "void | PromiseLike<void>";
    }
    return type;
  }

  function convertDomTypeToTsTypeWorker(obj: Browser.Typed): string {
    function convertBaseType() {
      if (!obj.additionalTypes && typeof obj.type === "string") {
        return convertDomTypeToTsTypeSimple(obj.type);
      } else {
        const types =
          typeof obj.type === "string"
            ? [{ ...obj, additionalTypes: undefined }]
            : obj.type;
        types.push(...(obj.additionalTypes ?? []).map((t) => ({ type: t })));

        const converted = types.map(convertDomTypeToTsTypeWorker);
        const isAny = converted.some((t) => t === "any");
        return isAny ? "any" : converted.join(" | ");
      }
    }

    const type = convertBaseType();
    const subtypeString = arrayify(obj.subtype)
      .map(convertDomTypeToTsType)
      .join(", ");

    return type === "Array" && subtypeString
      ? makeArrayType(subtypeString, obj)
      : `${type}${subtypeString ? `<${subtypeString}>` : ""}`;
  }

  function makeArrayType(elementType: string, obj: Browser.Typed): string {
    if (
      obj.subtype &&
      !Array.isArray(obj.subtype) &&
      obj.subtype.type === "float"
    ) {
      return "number[] | Float32Array";
    }

    return elementType.includes("|")
      ? `(${elementType})[]`
      : `${elementType}[]`;
  }

  function arrayify(obj: undefined | Browser.Typed | Browser.Typed[]) {
    if (!obj) {
      return [];
    }
    if (!Array.isArray(obj)) {
      return [obj];
    }
    return obj;
  }

  function convertDomTypeToTsTypeSimple(objDomType: string): string {
    if (objDomType === "sequence" && flavor !== "") {
      return "Iterable";
    }
    if (baseTypeConversionMap.has(objDomType)) {
      return baseTypeConversionMap.get(objDomType)!;
    }
    // Name of an interface / enum / dict. Just return itself
    if (
      allInterfacesMap[objDomType] ||
      allLegacyWindowAliases.includes(objDomType) ||
      allCallbackFunctionsMap[objDomType] ||
      allDictionariesMap[objDomType] ||
      allEnumsMap[objDomType]
    )
      return objDomType;
    // Name of a type alias. Just return itself
    if (allTypedefsMap[objDomType]) return objDomType;

    throw new Error("Unknown DOM type: " + objDomType);
  }

  function makeNullable(originalType: string) {
    switch (originalType) {
      case "any":
        return "any";
      case "void":
        return "void";
    }
    if (originalType.includes("=>") || originalType.includes("&")) {
      return "(" + originalType + ") | null";
    }
    return originalType + " | null";
  }

  function nameWithForwardedTypes(i: Browser.Interface) {
    const typeParameters = i.typeParameters;

    if (!typeParameters) return i.name;
    if (!typeParameters.length) return i.name;

    return `${i.name}<${typeParameters.map((t) => t.name)}>`;
  }

  function emitConstant(c: Browser.Constant) {
    emitComments(c, printer.printLine);
    printer.printLine(`readonly ${c.name}: ${c.value};`);
  }

  function emitConstants(i: Browser.Interface) {
    if (i.constants) {
      mapToArray(i.constants.constant).forEach(emitConstant);
    }
  }

  function matchParamMethodSignature(
    m: Browser.Method,
    expectedMName: string,
    expectedMType: string,
    expectedParamType: string | string[],
  ) {
    if (!Array.isArray(expectedParamType)) {
      expectedParamType = [expectedParamType];
    }

    return (
      expectedMName === m.name &&
      m.signature?.length === 1 &&
      convertDomTypeToTsType(m.signature[0]) === expectedMType &&
      m.signature[0].param?.length === expectedParamType.length &&
      expectedParamType.every(
        (pt, idx) => convertDomTypeToTsType(m.signature[0].param![idx]) === pt,
      )
    );
  }

  function getName(i: Browser.Interface) {
    return extendConflictsBaseTypes[i.name] ? `${i.name}Base` : i.name;
  }

  function getNameWithTypeParameters(
    typeParameters: Browser.TypeParameter[] | undefined,
    name: string,
  ) {
    function typeParameterWithDefault(type: Browser.TypeParameter) {
      return (
        type.name +
        (type.extends ? ` extends ${type.extends}` : "") +
        (type.default ? ` = ${type.default}` : "")
      );
    }

    if (!typeParameters) {
      return name;
    }
    return `${name}<${typeParameters
      .map(typeParameterWithDefault)
      .join(", ")}>`;
  }

  /// Emit overloads for the createElement method
  function emitCreateElementOverloads(m: Browser.Method) {
    if (
      matchParamMethodSignature(m, "createElement", "Element", [
        "string",
        "string | ElementCreationOptions",
      ])
    ) {
      printer.printLine(
        "createElement<K extends keyof HTMLElementTagNameMap>(tagName: K, options?: ElementCreationOptions): HTMLElementTagNameMap[K];",
      );
      printer.printLine("/** @deprecated */");
      printer.printLine(
        "createElement<K extends keyof HTMLElementDeprecatedTagNameMap>(tagName: K, options?: ElementCreationOptions): HTMLElementDeprecatedTagNameMap[K];",
      );
      printer.printLine(
        "createElement(tagName: string, options?: ElementCreationOptions): HTMLElement;",
      );
    }
  }

  /// Emit overloads for the getElementsByTagName method
  function emitGetElementsByTagNameOverloads(m: Browser.Method) {
    if (
      matchParamMethodSignature(
        m,
        "getElementsByTagName",
        "HTMLCollection",
        "string",
      )
    ) {
      const paramName = m.signature[0].param![0].name;
      for (const mapName of tagNameMapNames) {
        printer.printLine(
          `getElementsByTagName<K extends keyof ${mapName}>(${paramName}: K): HTMLCollectionOf<${mapName}[K]>;`,
        );
      }
      printer.printLine("/** @deprecated */");
      printer.printLine(
        `getElementsByTagName<K extends keyof HTMLElementDeprecatedTagNameMap>(${paramName}: K): HTMLCollectionOf<HTMLElementDeprecatedTagNameMap[K]>;`,
      );
      printer.printLine(
        `getElementsByTagName(${paramName}: string): HTMLCollectionOf<Element>;`,
      );
    }
  }

  /// Emit overloads for the querySelector method
  function emitQuerySelectorOverloads(m: Browser.Method) {
    if (
      matchParamMethodSignature(m, "querySelector", "Element | null", "string")
    ) {
      const paramName = m.signature[0].param![0].name;
      for (const mapName of tagNameMapNames) {
        printer.printLine(
          `querySelector<K extends keyof ${mapName}>(${paramName}: K): ${mapName}[K] | null;`,
        );
      }
      printer.printLine("/** @deprecated */");
      printer.printLine(
        `querySelector<K extends keyof HTMLElementDeprecatedTagNameMap>(${paramName}: K): HTMLElementDeprecatedTagNameMap[K] | null;`,
      );
      printer.printLine(
        `querySelector<E extends Element = Element>(${paramName}: string): E | null;`,
      );
    }
  }

  /// Emit overloads for the querySelectorAll method
  function emitQuerySelectorAllOverloads(m: Browser.Method) {
    if (
      matchParamMethodSignature(m, "querySelectorAll", "NodeList", "string")
    ) {
      const paramName = m.signature[0].param![0].name;
      for (const mapName of tagNameMapNames) {
        printer.printLine(
          `querySelectorAll<K extends keyof ${mapName}>(${paramName}: K): NodeListOf<${mapName}[K]>;`,
        );
      }
      printer.printLine("/** @deprecated */");
      printer.printLine(
        `querySelectorAll<K extends keyof HTMLElementDeprecatedTagNameMap>(${paramName}: K): NodeListOf<HTMLElementDeprecatedTagNameMap[K]>;`,
      );
      printer.printLine(
        `querySelectorAll<E extends Element = Element>(${paramName}: string): NodeListOf<E>;`,
      );
    }
  }

  function emitElementTagNameMap(name: string, map: Record<string, string>) {
    printer.printLine(`interface ${name} {`);
    printer.increaseIndent();
    for (const [e, value] of Object.entries(map).sort()) {
      printer.printLine(`"${e}": ${value};`);
    }
    printer.decreaseIndent();
    printer.printLine("}");
    printer.printLine("");
  }

  function emitDeprecatedHTMLOrSVGElementTagNameMap() {
    printer.printLine(
      "/** @deprecated Directly use HTMLElementTagNameMap or SVGElementTagNameMap as appropriate, instead. */",
    );
    printer.printLine(
      "type ElementTagNameMap = HTMLElementTagNameMap & Pick<SVGElementTagNameMap, Exclude<keyof SVGElementTagNameMap, keyof HTMLElementTagNameMap>>;",
    );
    printer.printLine("");
  }

  /// Emit overloads for the createEvent method
  function emitCreateEventOverloads(m: Browser.Method) {
    if (matchParamMethodSignature(m, "createEvent", "Event", "string")) {
      // Emit plurals. For example, "Events", "MutationEvents"
      const hasPlurals = [
        "Event",
        "MutationEvent",
        "MouseEvent",
        "SVGZoomEvent",
        "UIEvent",
      ];
      for (const x of distinctETypeList) {
        printer.printLine(`createEvent(eventInterface: "${x}"): ${x};`);
        if (hasPlurals.includes(x)) {
          printer.printLine(`createEvent(eventInterface: "${x}s"): ${x};`);
        }
      }
      printer.printLine("createEvent(eventInterface: string): Event;");
    }
  }

  function acceptsUrl(p: Browser.Param) {
    return (
      (p.name.toLowerCase().includes("url") &&
        typeof p.type === "string" &&
        ["USVString", "ScriptURLString"].includes(p.type)) ||
      p.type === "RequestInfo"
    );
  }

  function resolvePromise<T extends Browser.Typed>(t: T): T {
    const typedef =
      typeof t.type === "string" ? allTypedefsMap[t.type] : undefined;
    const typeOwner = typedef ?? t;
    if (typeOwner.type !== "Promise") {
      if (t.subtype) {
        return {
          ...t,
          subtype: Array.isArray(t.subtype)
            ? t.subtype.map(resolvePromise)
            : resolvePromise(t.subtype),
        };
      }
      return t;
    }
    const type = [typeOwner.subtype!].flat();
    type.push({ ...typeOwner, type: "PromiseLike" });
    return { ...t, subtype: undefined, type };
  }

  /// Generate the parameters string for function signatures
  function paramsToString(ps: Browser.Param[]) {
    function paramToString(p: Browser.Param) {
      p = resolvePromise(p);
      if (acceptsUrl(p)) {
        p = { ...p, additionalTypes: [...(p.additionalTypes ?? [])] };
        p.additionalTypes!.push("URL");
      }
      const pType = convertDomTypeToTsType(p);

      const isOptional = !p.variadic && p.optional;
      const variadicParams = p.variadic && pType.indexOf("|") !== -1;
      return (
        (p.variadic ? "..." : "") +
        adjustParamName(p.name) +
        (isOptional ? "?: " : ": ") +
        (variadicParams ? "(" : "") +
        pType +
        (variadicParams ? ")" : "") +
        (p.variadic ? "[]" : "")
      );
    }
    return ps.map(paramToString).join(", ");
  }

  function emitCallBackInterface(i: Browser.Interface) {
    const methods = mapToArray(i.methods.method);
    const m = methods[0];
    const overload = m.signature[0];
    const paramsString = overload.param ? paramsToString(overload.param) : "";
    const returnType = overload.type
      ? convertDomTypeToTsReturnType(overload)
      : "void";
    printer.printLine(
      `type ${i.name} = ((${paramsString}) => ${returnType}) | { ${m.name}(${paramsString}): ${returnType}; };`,
    );
    printer.printLine("");

    if (!mapToArray(i.constants?.constant ?? {}).length) {
      return;
    }

    printer.printLine(`declare var ${i.name}: {`);
    printer.increaseIndent();
    emitConstants(i);
    printer.decreaseIndent();
    printer.printLine("};");
    printer.printLine("");
  }

  function emitCallBackFunction(cb: Browser.CallbackFunction) {
    printer.printLine(
      `interface ${getNameWithTypeParameters(cb.typeParameters, cb.name)} {`,
    );
    printer.increaseIndent();
    emitSignatures(cb, "", "", printer.printLine, true);
    printer.decreaseIndent();
    printer.printLine("}");
    printer.printLine("");
  }

  function emitCallBackFunctions() {
    getElements(webidl.callbackFunctions, "callbackFunction")
      .sort(compareName)
      .forEach(emitCallBackFunction);
  }

  function emitEnum(e: Browser.Enum) {
    const values = e.value.slice().sort();
    printer.printLine(
      `type ${e.name} = ${values.map((v) => `"${v}"`).join(" | ")};`,
    );
  }

  function emitEnums() {
    getElements(webidl.enums, "enum")
      .sort(compareName)
      .filter((i) => !i.legacyNamespace)
      .forEach(emitEnum);
  }

  function emitEventHandlerThis(prefix: string, i: Browser.Interface) {
    if (prefix === "") {
      return `this: ${nameWithForwardedTypes(i)}, `;
    } else {
      return polluter ? `this: ${polluter.name}, ` : "";
    }
  }

  // A covariant EventHandler is one that is defined in a parent interface as then redefined in current interface with a more specific argument types
  // These patterns are unsafe, and flagged as error under --strictFunctionTypes.
  // Here we know the property is already defined on the interface, we elide its declaration if the parent has the same handler defined
  function isCovariantEventHandler(i: Browser.Interface, p: Browser.Property) {
    return (
      isEventHandler(p) &&
      iNameToEhParents[i.name].some((parent) =>
        parent.properties?.property.hasOwnProperty(p.name),
      )
    );
  }

  function emitProperty(
    prefix: string,
    i: Browser.Interface,
    emitScope: EmitScope,
    p: Browser.Property,
  ) {
    emitComments(p, printer.printLine);

    // Treat window.name specially because of
    //   - https://github.com/Microsoft/TypeScript/issues/9850
    //   - https://github.com/microsoft/TypeScript/issues/18433
    if (
      p.name === "name" &&
      i.name === "Window" &&
      emitScope === EmitScope.All
    ) {
      printer.printLine("/** @deprecated */");
      printer.printLine("declare const name: void;");
    } else {
      let pType: string;
      if (!p.overrideType && isEventHandler(p)) {
        // Sometimes event handlers with the same name may actually handle different
        // events in different interfaces. For example, "onerror" handles "ErrorEvent"
        // normally, but in "SVGSVGElement" it handles "SVGError" event instead.
        const eType = p.eventHandler
          ? getEventTypeInInterface(p.eventHandler!, i)
          : "Event";
        pType = `(${emitEventHandlerThis(prefix, i)}ev: ${eType}) => any`;
        if (typeof p.type === "string" && !p.type.endsWith("NonNull")) {
          pType = `(${pType}) | null`;
        }
      } else {
        pType = convertDomTypeToTsType(p);
      }
      if (p.optional) {
        pType += " | undefined";
      }
      const optionalModifier = !p.optional || prefix ? "" : "?";
      if (!prefix && !p.readonly && p.putForwards) {
        printer.printLine(`get ${p.name}${optionalModifier}(): ${pType};`);

        const forwardingProperty =
          allInterfacesMap[pType].properties?.property[p.putForwards];
        if (!forwardingProperty) {
          throw new Error("Couldn't find [PutForwards]");
        }
        const setterType = `${convertDomTypeToTsType(
          forwardingProperty,
        )} | ${pType}`;
        printer.printLine(
          `set ${p.name}${optionalModifier}(${p.putForwards}: ${setterType});`,
        );
      } else {
        const readOnlyModifier = p.readonly && prefix === "" ? "readonly " : "";
        printer.printLine(
          `${prefix}${readOnlyModifier}${p.name}${optionalModifier}: ${pType};`,
        );
      }
    }

    if (p.stringifier) {
      printer.printLine("toString(): string;");
    }
  }

  function emitComments(
    entity: {
      comment?: string;
      deprecated?: boolean | string;
      secureContext?: boolean;
      mdnUrl?: string;
    },
    print: (s: string) => void,
  ) {
    const comments = entity.comment?.split("\n") ?? [];
    const deprecated =
      typeof entity.deprecated === "string"
        ? `@deprecated ${entity.deprecated}`
        : entity.deprecated
          ? "@deprecated"
          : null;
    if (deprecated) {
      comments.push(deprecated);
    }
    if (entity.secureContext) {
      comments.push("Available only in secure contexts.");
    }
    if (entity.mdnUrl) {
      if (comments.length > 0) comments.push("");
      comments.push(`[MDN Reference](${entity.mdnUrl})`);
    }

    if (comments.length > 1) {
      print("/**");
      comments.forEach((l) => print(` * ${l}`.trimEnd()));
      print(" */");
    } else if (comments.length == 1) {
      print(`/** ${comments[0]} */`);
    }
  }

  function emitProperties(
    prefix: string,
    emitScope: EmitScope,
    i: Browser.Interface,
  ) {
    if (i.properties) {
      mapToArray(i.properties.property)
        .filter((m) => matchScope(emitScope, m))
        .filter((p) => !isCovariantEventHandler(i, p))
        .sort(compareName)
        .forEach((p) => emitProperty(prefix, i, emitScope, p));
    }
  }

  function emitMethod(
    prefix: string,
    m: Browser.Method,
    conflictedMembers: Set<string>,
  ) {
    function printLine(content: string) {
      if (m.name && conflictedMembers.has(m.name)) {
        printer.printLineToStack(content);
      } else {
        printer.printLine(content);
      }
    }

    emitComments(m, printLine);

    switch (m.name) {
      case "createElement":
        return emitCreateElementOverloads(m);
      case "createEvent":
        return emitCreateEventOverloads(m);
      case "getElementsByTagName":
        return emitGetElementsByTagNameOverloads(m);
      case "querySelector":
        return emitQuerySelectorOverloads(m);
      case "querySelectorAll":
        return emitQuerySelectorAllOverloads(m);
    }

    emitSignatures(m, prefix, m.name, printLine);
  }

  function emitSignature(
    s: Browser.Signature,
    prefix: string | undefined,
    name: string | undefined,
    printLine: (s: string) => void,
    shouldResolvePromise?: boolean,
  ) {
    const paramsString = s.param ? paramsToString(s.param) : "";
    const resolved = shouldResolvePromise ? resolvePromise(s) : s;
    const returnType = convertDomTypeToTsReturnType(resolved);
    emitComments(s, printLine);
    printLine(
      `${prefix || ""}${getNameWithTypeParameters(
        s.typeParameters,
        name || "",
      )}(${paramsString}): ${returnType};`,
    );
  }

  function emitSignatures(
    method: Browser.AnonymousMethod,
    prefix: string,
    name: string,
    printLine: (s: string) => void,
    shouldResolvePromise?: boolean,
  ) {
    if (method.overrideSignatures) {
      method.overrideSignatures!.forEach((s) => printLine(`${prefix}${s};`));
    } else if (method.signature) {
      method.additionalSignatures?.forEach((s) => printLine(`${prefix}${s};`));
      method.signature.forEach((sig) =>
        emitSignature(sig, prefix, name, printLine, shouldResolvePromise),
      );
    }
  }

  function emitMethods(
    prefix: string,
    emitScope: EmitScope,
    i: Browser.Interface,
    conflictedMembers: Set<string>,
  ) {
    // If prefix is not empty, then this is the global declare function addEventListener, we want to override this
    // Otherwise, this is EventTarget.addEventListener, we want to keep that.
    if (i.methods) {
      mapToArray(i.methods.method)
        .filter(
          (m) =>
            matchScope(emitScope, m) &&
            !(
              prefix !== "" &&
              (m.name === "addEventListener" ||
                m.name === "removeEventListener")
            ),
        )
        .filter((m) => {
          // Already covered by `extends`.
          switch (i.iterator?.kind) {
            case "maplike":
              return !["set", "clear", "delete"].includes(m.name);
            case "setlike":
              return !["add", "clear", "delete"].includes(m.name);
            default:
              return true;
          }
        })
        .sort(compareName)
        .forEach((m) => emitMethod(prefix, m, conflictedMembers));
    }
    if (i.anonymousMethods && emitScope === EmitScope.InstanceOnly) {
      const stringifier = i.anonymousMethods.method.find((m) => m.stringifier);
      if (stringifier) {
        printer.printLine("toString(): string;");
      }
    }

    // The window interface inherited some methods from "Object",
    // which need to explicitly exposed
    if (i.name === "Window" && prefix === "declare function ") {
      printer.printLine("declare function toString(): string;");
    }
  }

  // Emit forEach for iterators
  function emitIteratorForEach(i: Browser.Interface) {
    if (!i.iterator || i.iterator.async) {
      return;
    }
    const subtype = i.iterator.type.map(convertDomTypeToTsType);
    const value = subtype[subtype.length - 1];
    const key =
      subtype.length > 1
        ? subtype[0]
        : i.iterator.kind === "iterable"
          ? "number"
          : value;
    const name = i.typeParameters
      ? `${i.name}<${i.typeParameters!.map((p) => p.name).join(", ")}>`
      : i.name;
    printer.printLine(
      `forEach(callbackfn: (value: ${value}, key: ${key}, parent: ${name}) => void, thisArg?: any): void;`,
    );
  }

  /// Emit the properties and methods of a given interface
  function emitMembers(
    prefix: string,
    emitScope: EmitScope,
    i: Browser.Interface,
  ) {
    const conflictedMembers = extendConflictsBaseTypes[i.name]
      ? extendConflictsBaseTypes[i.name].memberNames
      : new Set<string>();
    emitProperties(prefix, emitScope, i);
    const methodPrefix = prefix.startsWith("declare var")
      ? "declare function "
      : "";
    emitMethods(methodPrefix, emitScope, i, conflictedMembers);
    if (emitScope === EmitScope.InstanceOnly) {
      emitIteratorForEach(i);
    }
  }

  /// Emit all members of every interfaces at the root level.
  /// Called only once on the global polluter object
  function emitAllMembers(i: Browser.Interface) {
    emitMembers(/*prefix*/ "declare var ", EmitScope.All, i);

    for (const relatedIName of iNameToIDependList[i.name]) {
      const i = allInterfacesMap[relatedIName];
      if (i) {
        emitAllMembers(i);
      }
    }
  }

  function emitEventHandlers(prefix: string, i: Browser.Interface) {
    const fPrefix = prefix.startsWith("declare var") ? "declare function " : "";

    for (const addOrRemove of ["add", "remove"]) {
      const optionsType =
        addOrRemove === "add"
          ? "AddEventListenerOptions"
          : "EventListenerOptions";
      if (tryEmitTypedEventHandlerForInterface(addOrRemove, optionsType)) {
        // only emit the string event handler if we just emitted a typed handler

        if (i.name === "EventSource") {
          printer.printLine(
            `${fPrefix}${addOrRemove}EventListener(type: string, listener: (this: EventSource, event: MessageEvent) => any, options?: boolean | ${optionsType}): void;`,
          );
        }

        printer.printLine(
          `${fPrefix}${addOrRemove}EventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | ${optionsType}): void;`,
        );
      }
    }

    return;

    function emitTypedEventHandler(
      prefix: string,
      addOrRemove: string,
      iParent: Browser.Interface,
      optionsType: string,
    ) {
      printer.printLine(
        `${prefix}${addOrRemove}EventListener<K extends keyof ${
          iParent.name
        }EventMap>(type: K, listener: (this: ${nameWithForwardedTypes(
          i,
        )}, ev: ${
          iParent.name
        }EventMap[K]) => any, options?: boolean | ${optionsType}): void;`,
      );
    }

    function tryEmitTypedEventHandlerForInterface(
      addOrRemove: string,
      optionsType: string,
    ) {
      const hasEventListener = iNameToEhList[i.name]?.length;
      const ehParentCount = iNameToEhParents[i.name]?.length;

      let target: Browser.Interface;
      if (hasEventListener || ehParentCount > 1) {
        target = i;
      } else if (ehParentCount === 1) {
        target = iNameToEhParents[i.name][0];
      } else {
        return false;
      }

      emitTypedEventHandler(fPrefix, addOrRemove, target, optionsType);
      return true;
    }
  }

  function emitConstructorSignature(i: Browser.Interface) {
    const constructor =
      typeof i.constructor === "object" ? i.constructor : undefined;

    // Emit constructor signature
    if (constructor) {
      emitComments(constructor, printer.print);
      emitSignatures(constructor, "", "new", printer.printLine);
    } else {
      printer.printLine(`new(): ${i.name};`);
    }
  }

  function emitConstructor(i: Browser.Interface, prefix = "") {
    if (i.deprecated) {
      printer.printLine(`/** @deprecated */`);
    }
    printer.printLine(`${prefix}var ${i.name}: {`);
    printer.increaseIndent();

    // TODO: To be more accurate, this should be `readonly prototype`
    // however, TypeScript's ability to keep track of readonly-ness can
    // sometimes fail in un-expected ways, making this not backwards compatible.
    printer.printLine(`prototype: ${i.name};`);
    emitConstructorSignature(i);
    emitConstants(i);
    if (iNameToConstParents[i.name]?.length) {
      for (const parent of iNameToConstParents[i.name]) {
        emitConstants(parent);
      }
    }
    emitMembers(/*prefix*/ "", EmitScope.StaticOnly, i);

    printer.decreaseIndent();
    printer.printLine("};");
    printer.printLine("");

    if (global === "Window" && i.legacyWindowAlias) {
      for (const alias of i.legacyWindowAlias!) {
        printer.printLine(`type ${alias} = ${i.name};`);
        printer.printLine(`declare var ${alias}: typeof ${i.name};`);
        printer.printLine("");
      }
    }
  }

  function emitNamedConstructor(i: Browser.Interface) {
    const nc = i.namedConstructor;
    if (nc) {
      printer.printLine(`declare var ${nc.name}: {`);
      printer.increaseIndent();
      nc.signature.forEach((s) =>
        printer.printLine(
          `new(${s.param ? paramsToString(s.param) : ""}): ${i.name};`,
        ),
      );
      printer.decreaseIndent();
      printer.printLine(`};`);
    }
  }

  /// Emit all the named constructors at root level
  function emitNamedConstructors() {
    getElements(webidl.interfaces, "interface")
      .sort(compareName)
      .forEach(emitNamedConstructor);
  }

  function emitInterfaceDeclaration(i: Browser.Interface) {
    function processIName(iName: string) {
      return extendConflictsBaseTypes[iName] ? `${iName}Base` : iName;
    }

    const processedIName = processIName(i.name);

    if (processedIName !== i.name) {
      printer.printLineToStack(
        `interface ${getNameWithTypeParameters(
          i.typeParameters,
          i.name,
        )} extends ${processedIName} {`,
      );
    }

    emitComments(i, printer.printLine);

    printer.print(
      `interface ${getNameWithTypeParameters(i.typeParameters, processedIName)}`,
    );

    const finalExtends = [i.extends || "Object"]
      .concat(getImplementList(i.name))
      .filter((i) => i !== "Object")
      .map(processIName);

    if (finalExtends.length) {
      printer.print(` extends ${assertUnique(finalExtends).join(", ")}`);
    }
    printer.print(" {");
    printer.endLine();
  }

  /// To decide if a given method is an indexer and should be emitted
  function shouldEmitIndexerSignature(
    i: Browser.Interface,
    m: Browser.AnonymousMethod,
  ) {
    if (m.getter && m.signature[0]?.param?.length === 1) {
      // TypeScript array indexer can only be number or string
      // for string, it must return a more generic type then all
      // the other properties, following the Dictionary pattern
      switch (convertDomTypeToTsType(m.signature[0].param![0])) {
        case "number":
          return true;
        case "string": {
          if (convertDomTypeToTsType(m.signature[0]) === "any") {
            return true;
          }
          const sig = m.signature[0];
          const mTypes = distinct(
            mapValues(
              i.methods?.method,
              (m) => m.signature?.[0].type || "void",
            ).filter((t) => t !== "void") || [],
          );
          const amTypes = distinct(
            i.anonymousMethods?.method
              .map((m) => m.signature[0].type)
              .filter((t) => t !== "void") || [],
          ); // |>  Array.distinct
          const pTypes = distinct(
            mapValues(i.properties?.property, (m) => m.type).filter(
              (t) => t !== "void",
            ) || [],
          ); // |>  Array.distinct

          if (
            mTypes.length === 0 &&
            amTypes.length === 1 &&
            pTypes.length === 0
          )
            return amTypes[0] === sig.type;
          if (
            mTypes.length === 1 &&
            amTypes.length === 1 &&
            pTypes.length === 0
          )
            return mTypes[0] === amTypes[0] && amTypes[0] === sig.type;
          if (
            mTypes.length === 0 &&
            amTypes.length === 1 &&
            pTypes.length === 1
          )
            return amTypes[0] === pTypes[0] && amTypes[0] === sig.type;
          if (
            mTypes.length === 1 &&
            amTypes.length === 1 &&
            pTypes.length === 1
          )
            return (
              mTypes[0] === amTypes[0] &&
              amTypes[0] === pTypes[0] &&
              amTypes[0] === sig.type
            );
        }
      }
    }
    return false;
  }

  function emitIndexers(emitScope: EmitScope, i: Browser.Interface) {
    if (i.overrideIndexSignatures) {
      i.overrideIndexSignatures!.forEach((s) => printer.printLine(`${s};`));
    } else {
      // The indices could be within either Methods or Anonymous Methods
      mapToArray<Browser.AnonymousMethod>(i.methods?.method)
        .concat(i.anonymousMethods?.method || [])
        .filter(
          (m) => shouldEmitIndexerSignature(i, m) && matchScope(emitScope, m),
        )
        .forEach((m) => {
          const indexer = m.signature?.[0].param?.[0];
          if (indexer) {
            printer.printLine(
              `[${indexer.name}: ${convertDomTypeToTsType(
                indexer,
              )}]: ${convertDomTypeToTsType({
                type: m.signature[0].type,
                overrideType: m.signature[0].overrideType,
                subtype: m.signature[0].subtype,
                nullable: undefined,
              })};`,
            );
          }
        });
    }
  }

  function emitInterfaceEventMap(i: Browser.Interface) {
    function emitInterfaceEventMapEntry(eventName: string) {
      printer.printLine(
        `"${eventName}": ${getEventTypeInInterface(eventName, i)};`,
      );
    }

    const hasEventHandlers = iNameToEhList[i.name]?.length;
    const ehParentCount = iNameToEhParents[i.name]?.length;

    if (hasEventHandlers || ehParentCount > 1) {
      printer.print(`interface ${i.name}EventMap`);
      if (ehParentCount) {
        const extend = iNameToEhParents[i.name].map((i) => i.name + "EventMap");
        printer.print(` extends ${assertUnique(extend).join(", ")}`);
      }
      printer.print(" {");
      printer.endLine();
      printer.increaseIndent();
      iNameToEhList[i.name].forEach(emitInterfaceEventMapEntry);
      printer.decreaseIndent();
      printer.printLine("}");
      printer.printLine("");
    }
  }

  function emitInterface(i: Browser.Interface) {
    printer.clearStack();
    emitInterfaceEventMap(i);

    emitInterfaceDeclaration(i);
    printer.increaseIndent();

    emitMembers(/*prefix*/ "", EmitScope.InstanceOnly, i);
    emitConstants(i);
    emitEventHandlers(/*prefix*/ "", i);
    emitIndexers(EmitScope.InstanceOnly, i);

    printer.decreaseIndent();
    printer.printLine("}");
    printer.printLine("");

    if (!printer.stackIsEmpty()) {
      printer.printStackContent();
      printer.printLine("}");
      printer.printLine("");
    }
  }

  function emitNonCallbackInterfaces() {
    for (const i of allNonCallbackInterfaces.sort(compareName)) {
      if (i.legacyNamespace) {
        continue;
      } else if (i.noInterfaceObject) {
        emitInterface(i);
      } else {
        emitInterface(i);
        emitConstructor(i, "declare ");
      }
    }
  }

  function emitNamespace(namespace: Browser.Interface) {
    if (namespace.comment) {
      printer.printLine(`/** ${namespace.comment} */`);
    }

    if (namespacesAsInterfaces.includes(namespace.name)) {
      const name = namespace.name[0].toUpperCase() + namespace.name.slice(1);
      emitInterface({ ...namespace, name });
      printer.printLine(`declare var ${namespace.name}: ${name};`);
      printer.printLine("");
      return;
    }

    printer.printLine(`declare namespace ${namespace.name} {`);
    printer.increaseIndent();

    if (namespace.nested) {
      namespace.nested.interfaces.sort(compareName).forEach((i) => {
        emitInterface(i);
        emitConstructor(i);
      });
      namespace.nested.dictionaries.sort(compareName).forEach(emitDictionary);
      namespace.nested.enums.sort(compareName).forEach(emitEnum);
      namespace.nested.typedefs.sort(compareName).forEach(emitTypeDef);
    }

    emitProperties("var ", EmitScope.InstanceOnly, namespace);
    emitMethods("function ", EmitScope.InstanceOnly, namespace, new Set());

    printer.decreaseIndent();
    printer.printLine("}");
    printer.printLine("");
  }

  function emitDictionary(dict: Browser.Dictionary) {
    if (!dict.extends || dict.extends === "Object") {
      printer.printLine(
        `interface ${getNameWithTypeParameters(
          dict.typeParameters,
          dict.name,
        )} {`,
      );
    } else {
      printer.printLine(
        `interface ${getNameWithTypeParameters(
          dict.typeParameters,
          dict.name,
        )} extends ${dict.extends} {`,
      );
    }
    printer.increaseIndent();
    if (dict.members) {
      mapToArray(dict.members.member)
        .sort(compareName)
        .forEach((m) => {
          emitComments(m, printer.printLine);
          printer.printLine(
            `${m.name}${m.required ? "" : "?"}: ${convertDomTypeToTsType(m)};`,
          );
        });
    }
    if (dict.overrideIndexSignatures) {
      dict.overrideIndexSignatures!.forEach((s) => printer.printLine(`${s};`));
    }
    printer.decreaseIndent();
    printer.printLine("}");
    printer.printLine("");
  }

  function emitDictionaries() {
    getElements(webidl.dictionaries, "dictionary")
      .sort(compareName)
      .filter((i) => !i.legacyNamespace)
      .forEach(emitDictionary);
  }

  function emitTypeDef(typeDef: Browser.TypeDef) {
    emitComments(typeDef, printer.printLine);
    printer.printLine(
      `type ${getNameWithTypeParameters(
        typeDef.typeParameters,
        typeDef.name,
      )} = ${convertDomTypeToTsType(typeDef)};`,
    );
  }

  function emitTypeDefs() {
    if (webidl.typedefs) {
      webidl.typedefs.typedef
        .filter((i) => !i.legacyNamespace)
        .sort(compareName)
        .forEach(emitTypeDef);
    }
  }

  function compareName(c1: { name: string }, c2: { name: string }) {
    return c1.name < c2.name ? -1 : c1.name > c2.name ? 1 : 0;
  }

  function emit() {
    printer.reset();
    printer.printLine("/////////////////////////////");
    printer.printLine(`/// ${global} APIs`);
    printer.printLine("/////////////////////////////");
    printer.printLine("");

    emitDictionaries();
    getElements(webidl.callbackInterfaces, "interface")
      .sort(compareName)
      .forEach((i) => emitCallBackInterface(i));
    emitNonCallbackInterfaces();

    collectLegacyNamespaceTypes(webidl).forEach(emitNamespace);

    emitCallBackFunctions();

    if (global === "Window") {
      emitElementTagNameMap(
        "HTMLElementTagNameMap",
        tagNameToEleName.htmlResult,
      );
      emitElementTagNameMap(
        "HTMLElementDeprecatedTagNameMap",
        tagNameToEleName.htmlDeprecatedResult,
      );
      emitElementTagNameMap("SVGElementTagNameMap", tagNameToEleName.svgResult);
      emitElementTagNameMap(
        "MathMLElementTagNameMap",
        tagNameToEleName.mathMLResult,
      );
      emitDeprecatedHTMLOrSVGElementTagNameMap();
      emitNamedConstructors();
    }

    if (polluter) {
      emitAllMembers(polluter);
      emitEventHandlers("declare var ", polluter);
    }

    emitTypeDefs();
    emitEnums();

    return printer.getResult();
  }

  function stringifySingleOrTupleTypes(types: string[]) {
    if (types.length === 1) {
      return types[0];
    }
    return `[${types.join(", ")}]`;
  }

  function emitSelfIterator(i: Browser.Interface) {
    if (!useIteratorObject) return;
    const async = i.iterator?.async;
    const name = getName(i);
    const iteratorBaseType = `${async ? "Async" : ""}IteratorObject`;
    const iteratorType = `${name}${async ? "Async" : ""}Iterator`;
    const iteratorSymbol = async ? "Symbol.asyncIterator" : "Symbol.iterator";
    printer.printLine("");
    printer.printLine(
      `interface ${iteratorType}<T> extends ${iteratorBaseType}<T, BuiltinIteratorReturn, unknown> {`,
    );
    printer.increaseIndent();
    printer.printLine(`[${iteratorSymbol}](): ${iteratorType}<T>;`);
    printer.decreaseIndent();
    printer.printLine("}");
  }

  function emitIterableMethods(
    i: Browser.Interface,
    name: string,
    subtypes: string[],
  ) {
    switch (i.iterator?.kind) {
      case "maplike":
      case "setlike":
        return;
    }
    const async = i.iterator?.async;
    const iteratorType = async
      ? !useIteratorObject
        ? "AsyncIterableIterator"
        : `${name}AsyncIterator`
      : !useIteratorObject
        ? "IterableIterator"
        : subtypes.length !== 1
          ? `${name}Iterator`
          : "ArrayIterator";
    const methods = [];
    methods.push({
      name: `[Symbol.${async ? "asyncIterator" : "iterator"}]`,
      type: stringifySingleOrTupleTypes(subtypes),
    });
    if (i.iterator?.kind === "iterable") {
      if (subtypes.length === 2) {
        const [keyType, valueType] = subtypes;
        methods.push(
          { name: "entries", type: stringifySingleOrTupleTypes(subtypes) },
          { name: "keys", type: keyType },
          { name: "values", type: valueType },
        );
      } else if (subtypes.length === 1) {
        subtypes.unshift("number");
        const [keyType, valueType] = subtypes;
        if (!async) {
          methods.push(
            { name: "entries", type: stringifySingleOrTupleTypes(subtypes) },
            { name: "keys", type: keyType },
            { name: "values", type: valueType },
          );
        } else {
          methods.push({ name: "values", type: valueType });
        }
      }
    }

    if (methods.length) {
      const comments = i.iterator?.comments?.comment;

      const paramsString = i.iterator?.param
        ? paramsToString(i.iterator.param)
        : "";

      methods.forEach((m) => {
        emitComments({ comment: comments?.[m.name] }, printer.printLine);
        printer.printLine(
          `${m.name}(${paramsString}): ${iteratorType}<${m.type}>;`,
        );
      });
    }
  }

  function emitIterator(i: Browser.Interface) {
    // https://webidl.spec.whatwg.org/#dfn-indexed-property-getter
    const isIndexedPropertyGetter = (m: Browser.AnonymousMethod) =>
      m.getter &&
      m.signature[0]?.param?.length === 1 &&
      typeof m.signature[0].param[0].type === "string" &&
      integerTypes.has(m.signature[0].param[0].type);

    function findIterableGetter() {
      const anonymousGetter = i.anonymousMethods?.method.find(
        isIndexedPropertyGetter,
      );

      if (anonymousGetter) return anonymousGetter;
      else if (i.methods)
        return mapToArray(i.methods.method).find(isIndexedPropertyGetter);
      else return undefined;
    }

    function getIteratorSubtypes() {
      if (i.iterator && !i.iterator.async) {
        if (i.iterator.type.length === 1) {
          return [convertDomTypeToTsType(i.iterator.type[0])];
        }
        return i.iterator.type.map(convertDomTypeToTsType);
      } else if (i.name !== "Window") {
        const iterableGetter = findIterableGetter();
        if (iterableGetter) {
          return [
            convertDomTypeToTsType({
              type: iterableGetter.signature[0].type,
              overrideType: iterableGetter.signature[0].overrideType,
            }),
          ];
        }
      }
    }

    function getIteratorExtends(
      iterator?: Browser.Iterator,
      subtypes?: string[],
    ) {
      if (!iterator || !subtypes) {
        return "";
      }
      const base =
        iterator.kind === "maplike"
          ? `Map<${subtypes[0]}, ${subtypes[1]}>`
          : iterator.kind === "setlike"
            ? `Set<${subtypes[0]}>`
            : undefined;
      if (!base) {
        return "";
      }
      const result = iterator.readonly ? `Readonly${base}` : base;
      return `extends ${result} `;
    }

    function hasSequenceArgument(s: Browser.Signature) {
      function typeIncludesSequence(type: string | Browser.Typed[]): boolean {
        if (Array.isArray(type)) {
          return type.some((t) => typeIncludesSequence(t.type));
        }
        return type === "sequence" || !!sequenceTypedefMap[type];
      }
      return s.param?.some(
        (p) => !p.overrideType && typeIncludesSequence(p.type),
      );
    }

    function replaceTypedefsInSignatures(
      signatures: Browser.Signature[],
    ): Browser.Signature[] {
      return signatures.map((s) => {
        const params = s.param!.map((p) => {
          const typedef =
            typeof p.type === "string" ? sequenceTypedefMap[p.type] : undefined;
          if (!typedef) {
            return p;
          }
          return { ...p, type: typedef.type };
        });
        return { ...s, param: params };
      });
    }

    const sequenceTypedefs = !webidl.typedefs
      ? []
      : webidl.typedefs.typedef
          .filter((typedef) => Array.isArray(typedef.type))
          .map((typedef) => ({
            ...typedef,
            type: (typedef.type as Browser.Typed[]).filter(
              (t) => t.type === "sequence",
            ),
          }))
          .filter((typedef) => typedef.type.length);
    const sequenceTypedefMap = arrayToMap(
      sequenceTypedefs,
      (t) => t.name,
      (t) => t,
    );

    const subtypes = getIteratorSubtypes();
    const methodsWithSequence: Browser.Method[] = mapToArray(
      i.methods ? i.methods.method : {},
    )
      .filter((m) => m.signature && !m.overrideSignatures)
      .map((m) => ({
        ...m,
        signature: replaceTypedefsInSignatures(
          m.signature.filter(hasSequenceArgument),
        ),
      }))
      .filter((m) => m.signature.length)
      .sort(compareName);

    if (!subtypes && !methodsWithSequence.length) {
      return;
    }

    const iteratorExtends = getIteratorExtends(i.iterator, subtypes);
    const name = getName(i);
    const nameWithTypeParameters = getNameWithTypeParameters(
      i.typeParameters,
      name,
    );

    if (i.iterator?.kind === "iterable" && subtypes?.length === 2) {
      emitSelfIterator(i);
    }

    printer.printLine("");
    printer.printLine(
      `interface ${nameWithTypeParameters} ${iteratorExtends}{`,
    );
    printer.increaseIndent();

    methodsWithSequence.forEach((m) => emitMethod("", m, new Set()));

    if (subtypes) {
      emitIterableMethods(i, name, subtypes);
    }

    printer.decreaseIndent();
    printer.printLine("}");
  }

  function emitAsyncIterator(i: Browser.Interface) {
    function getAsyncIteratorSubtypes() {
      if (i.iterator && i.iterator.kind === "iterable" && i.iterator.async) {
        if (i.iterator.type.length === 1) {
          return [convertDomTypeToTsType(i.iterator.type[0])];
        }
        return i.iterator.type.map(convertDomTypeToTsType);
      }
    }

    const subtypes = getAsyncIteratorSubtypes();
    if (!subtypes) {
      return;
    }

    const name = getName(i);
    const nameWithTypeParameters = getNameWithTypeParameters(
      i.typeParameters,
      name,
    );

    emitSelfIterator(i);

    printer.printLine("");
    printer.printLine(`interface ${nameWithTypeParameters} {`);
    printer.increaseIndent();

    emitIterableMethods(i, name, subtypes);

    printer.decreaseIndent();
    printer.printLine("}");
  }

  function emitES6ToStringTag() {
    printer.reset();
    printer.printLine("/////////////////////////////");
    printer.printLine(`/// ${global} [Symbol.toStringTag] APIs`);
    printer.printLine("/////////////////////////////");

    const toStringTagProperty = {
      type: "USVString",
      name: "[Symbol.toStringTag]",
      readonly: true,
    };

    const interfaces = getElements(webidl.interfaces, "interface");
    interfaces.sort(compareName).forEach((i) => {
      if (!i.noInterfaceObject && !i.extends && !i.legacyNamespace) {
        printer.printLine("");
        printer.printLine(`interface ${i.name} {`);
        printer.increaseIndent();

        emitProperty("", i, EmitScope.InstanceOnly, toStringTagProperty);

        printer.decreaseIndent();
        printer.printLine("}");
      }
    });

    return printer.getResult();
  }

  function emitES6DomIterators() {
    printer.reset();
    printer.printLine("/////////////////////////////");
    printer.printLine(`/// ${global} Iterable APIs`);
    printer.printLine("/////////////////////////////");

    allInterfaces.sort(compareName).forEach(emitIterator);

    return printer.getResult();
  }

  function emitES2018DomAsyncIterators() {
    printer.reset();
    printer.printLine("/////////////////////////////");
    printer.printLine(`/// ${global} Async Iterable APIs`);
    printer.printLine("/////////////////////////////");

    allInterfaces.sort(compareName).forEach(emitAsyncIterator);

    return printer.getResult();
  }
}
