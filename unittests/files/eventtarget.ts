declare const target: EventTarget;

target.addEventListener("custom", (event) => {
  event.target;
});

interface CustomEventMap {
  custom: CustomEvent<{ data: number }>;
}

declare const customTarget: EventTarget<CustomEventMap>;

customTarget.addEventListener("custom", (event) => {
  event.detail.data;
});
