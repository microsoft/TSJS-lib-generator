new CustomEvent<null>("a").detail satisfies null;
new CustomEvent<void>("b").detail satisfies null;
new CustomEvent<undefined>("c").detail satisfies null;
new CustomEvent<string>("d").detail satisfies string;
new CustomEvent<string | undefined>("e").detail satisfies string | null;

// @ts-expect-error Wrong type
new CustomEvent<null>("a").detail satisfies undefined;
// @ts-expect-error Wrong type
new CustomEvent<void>("b").detail satisfies void;
// @ts-expect-error Wrong type
new CustomEvent<undefined>("c").detail satisfies undefined;
// @ts-expect-error Wrong type
new CustomEvent<string>("d").detail satisfies number;
// @ts-expect-error Wrong type
new CustomEvent<string | undefined>("e").detail satisfies string | undefined;
