export const CONTRAST_STORAGE_KEY = 'tydio-contrast'
export const CONTRAST_CHANGE_EVENT = 'tydio-contrast-change'

// Runs in <head> before first paint (see app/layout.tsx). A saved choice wins;
// otherwise follow the OS "increase contrast" setting.
export const CONTRAST_INIT_SCRIPT = `(function(){try{var v=localStorage.getItem('${CONTRAST_STORAGE_KEY}');if(v!=='high'&&v!=='default'){v=window.matchMedia('(prefers-contrast: more)').matches?'high':'default'}if(v==='high')document.documentElement.dataset.contrast='high'}catch(e){}})()`
