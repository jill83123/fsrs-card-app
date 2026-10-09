declare module '@diffusionstudio/piper-wasm/build/piper_phonemize.js' {
  interface PiperPhonemizeModule {
    callMain(args: string[]): void
  }
  const createPiperPhonemize: (options: Record<string, unknown>) => Promise<PiperPhonemizeModule>
  export default createPiperPhonemize
}
