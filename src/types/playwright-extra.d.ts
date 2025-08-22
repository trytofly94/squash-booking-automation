declare module 'playwright-extra' {
  import { Browser, BrowserType, LaunchOptions } from '@playwright/test';
  
  interface PlaywrightExtra {
    chromium: BrowserType<Browser> & {
      use(_plugin: any): void;
      launch(_options?: LaunchOptions): Promise<Browser>;
    };
    firefox: BrowserType<Browser> & {
      use(_plugin: any): void;
      launch(_options?: LaunchOptions): Promise<Browser>;
    };
    webkit: BrowserType<Browser> & {
      use(_plugin: any): void;
      launch(_options?: LaunchOptions): Promise<Browser>;
    };
  }
  
  const playwright: PlaywrightExtra;
  export = playwright;
}