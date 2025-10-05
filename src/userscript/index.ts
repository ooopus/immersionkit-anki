// ==UserScript==
// @name         ImmersionKit → Anki
// @namespace    immersionkit_to_anki
// @version      1.1.0
// @description  Add example images and audio from ImmersionKit's dictionary pages to your latest Anki note via AnkiConnect.
// @match        https://www.immersionkit.com/dictionary*
// @connect      apiv2.immersionkit.com
// @connect      us-southeast-1.linodeobjects.com
// @connect      127.0.0.1
// @connect      localhost
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

import { startUserscript, registerMenu } from './ui';

(function () {
  'use strict';
  startUserscript();
  registerMenu();
})();


