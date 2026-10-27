export const debounce = <Args extends unknown[]>(fn: (...args: Args) => void, delay: number) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const debouncedFn = (...args: Args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      fn(...args);
    }, delay);
  };
  debouncedFn.cancel = () => {
    clearTimeout(timeoutId);
    timeoutId = undefined;
  };
  return debouncedFn;
};
