export {};

declare global {
  interface Window {
    __measure: {
      emit(name: string): void;
      flush(): number;
      readCounts(): Record<string, number>;
    };
  }
}
