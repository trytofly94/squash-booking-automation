declare module 'playwright-extra-plugin-stealth' {
  interface StealthPlugin {
    (): any;
  }
  
  const StealthPlugin: StealthPlugin;
  export = StealthPlugin;
}