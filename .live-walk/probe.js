// Use the running app's existing modules. The bundle has a global window.__antonClientFetch only
// in dev. In Capacitor APK, the module graph is bundled. Search loaded scripts for clientFetch by
// hooking into the existing app: send a signed request through the mesh transport via the public api.
//
// Simpler: just call fetch() against the mesh — the WebView's fetch is monkey-patched to route via mesh.
(async () => {
  try {
    // The mesh-paired phone uses relative paths via clientFetch; raw fetch with a relative path
    // hits the WebView's https://localhost. That won't reach the instance. Need the wrapped fetch.
    // Try to access it via the module any page has imported.
    // Inspect: any element on the page should have data showing the active instance.
    var instances = JSON.parse(localStorage.getItem('anton-companion-instances') || '[]');
    var activeId = localStorage.getItem('anton-companion-active-instance');
    var inst = instances.find(i => i.id === activeId);
    return 'transport=' + (inst && inst.transport) + ' relays=' + JSON.stringify(inst && inst.relay_endpoints) + ' base=' + (inst && inst.server_base);
  } catch (e) {
    return 'ERR=' + (e && e.message ? e.message : String(e));
  }
})()
