export const date=(value: string) => new Date(value).toLocaleDateString("zh-CN", {
  month: "short",
  day: "numeric",
});
