import { listAll, Element as WebRefElement } from "@webref/elements";
import { Interface, WebIdl } from "../types.js";
import { addToArrayMap } from "../utils/map.js";

async function getInterfaceToElementMap(): Promise<{
  html: Map<string, WebRefElement[]>;
  svg: Map<string, WebRefElement[]>;
}> {
  const all = await listAll();
  const html = new Map<string, WebRefElement[]>();
  const svg = new Map<string, WebRefElement[]>();
  for (const item of Object.values(all)) {
    const { elements } = item;
    for (const element of elements) {
      if (!element.interface) {
        continue;
      }
      const targetMap = element.interface.startsWith("SVG") ? svg : html;
      addToArrayMap(targetMap, element.interface, element);
    }
  }
  return { html, svg };
}

export async function getInterfaceElementMergeData(): Promise<WebIdl> {
  const data: WebIdl = { interfaces: { interface: {} } };
  const { html, svg } = await getInterfaceToElementMap();
  for (const [key, elements] of html) {
    data.interfaces!.interface[key] = {
      element: elements.map((el) => ({
        name: el.name,
        deprecated: el.obsolete,
      })),
    } as Interface;
  }
  for (const [key, elements] of svg) {
    data.interfaces!.interface[key] = {
      element: elements.map((el) => ({
        namespace: "SVG",
        name: el.name,
        deprecated: el.obsolete,
      })),
    } as Interface;
  }
  return data;
}
