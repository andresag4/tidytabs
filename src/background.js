import { register as registerContextMenu } from './contextmenu.js';

chrome.runtime.onInstalled.addListener(() => registerContextMenu());
chrome.runtime.onStartup.addListener(() => registerContextMenu());
registerContextMenu();
