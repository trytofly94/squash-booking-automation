declare module 'playwright-extra' {
  import { Browser, BrowserType, LaunchOptions } from '@playwright/test';
  
  interface PlaywrightExtra {
    chromium: BrowserType<Browser> & {
      use(plugin: any): void;
      launch(options?: LaunchOptions): Promise<Browser>;
    };
    firefox: BrowserType<Browser> & {
      use(plugin: any): void;
      launch(options?: LaunchOptions): Promise<Browser>;
    };
    webkit: BrowserType<Browser> & {
      use(plugin: any): void;
      launch(options?: LaunchOptions): Promise<Browser>;
    };
  }
  
  const playwright: PlaywrightExtra;
  export = playwright;
}