/// <reference types="svelte" />
/// <reference types="vite/client" />
/// <reference types="vite-plugin-monkey/client" />
/// <reference types="vite-plugin-monkey/style" />
/// <reference types="tampermonkey" />
// If you enable mountGmApi in dev, uncomment the next line for typing globals
// /// <reference types="vite-plugin-monkey/global" />

declare module '*.css?raw' {
    const css: string;
    export default css;
}
