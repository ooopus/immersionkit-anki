import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import monkey from 'vite-plugin-monkey';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    monkey({
      entry: 'src/userscript/index.ts',
      userscript: {
        name: 'ImmersionKit → Anki',
        namespace: 'immersionkit_to_anki',
        version: '1.1.2',
        description:
          "Add example images and audio from ImmersionKit's dictionary pages to your latest Anki note via AnkiConnect.",
        icon: 'https://vitejs.dev/logo.svg',
        match: ['https://www.immersionkit.com/*'],
        connect: [
          'apiv2.immersionkit.com',
          'us-southeast-1.linodeobjects.com',
          '127.0.0.1',
          'localhost',
        ],
        grant: [
          'GM_xmlhttpRequest',
          'GM_addStyle',
          'GM_registerMenuCommand',
          'GM_getValue',
          'GM_setValue',
        ],
      },
      build: {
        fileName: 'immersionkit-to-anki.user.js',
        metaFileName: true,
        autoGrant: true,
      },
    }),
  ],
});
