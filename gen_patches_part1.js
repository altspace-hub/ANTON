const fs = require("fs");

function genKS(ks) {
  const parts = [];
  if (ks.claudeKnowledge) {
    const ck = ks.claudeKnowledge;
    parts.push("        claudeKnowledge: { enabled: " + ck.enabled + ", webSearchEnabled: " + ck.webSearchEnabled + ", description: " + JSON.stringify(ck.description || "") + " },");
  }
  if (ks.localFolder) {
    const lf = ks.localFolder;
    parts.push("        localFolder: { enabled: " + lf.enabled + ", folderPaths: [], recursive: " + lf.recursive + " },");
  }
  return parts.join("\n");
}

function genModule(m) {
  const ks = m.defaults.knowledgeSources || {};
  const ksContent = genKS(ks);
  const ofStr = JSON.stringify(m.defaults.outputFormats || []);
  const li = [
    "  {",
    "    id: " + JSON.stringify(m.id) + ",",
    "    label: " + JSON.stringify(m.label) + ",",
    "    shortLabel: " + JSON.stringify(m.shortLabel) + ",",
    "    icon: " + JSON.stringify(m.icon) + ",",
    "    description: " + JSON.stringify(m.description) + ",",
    "    color: " + JSON.stringify(m.color) + ",",
    "    defaults: {",
    "      thinking: " + JSON.stringify(m.defaults.thinking) + ",",
    "      creativity: " + JSON.stringify(m.defaults.creativity) + ",",
    "      outputFormats: " + ofStr + ",",
    "      knowledgeSources: {",
    ksContent,
    "      },",
    "    },",
    "  },"
  ];
  return li.join("
");
}

function loadAreas(areas) {
  const result = {};
  for (const area of areas) {
    const ap = "C:/FCP_Workbench/server/areas/" + area;
    const areaJson = JSON.parse(fs.readFileSync(ap + "/area.json", "utf8"));
    const mods = fs.readdirSync(ap + "/modules").sort();
    result[area] = { area: areaJson, modules: [] };
    for (const mod of mods) {
      const d = JSON.parse(fs.readFileSync(ap + "/modules/" + mod + "/module.json", "utf8"));
      result[area].modules.push({
        id: d.id, label: d.label,
        shortLabel: d.shortLabel || d.label,
        icon: d.icon, description: d.description, color: d.color,
        defaults: {
          thinking: d.defaults && d.defaults.thinking,
          creativity: d.defaults && d.defaults.creativity,
          outputFormats: (d.defaults && d.defaults.outputFormats) || [],
          knowledgeSources: (d.defaults && d.defaults.knowledgeSources) || {}
        }
      });
    }
  }
  return result;
}

function buildPatch(areas, exportNames, comments, fileHeader, combinedExport) {
  const data = loadAreas(areas);
  let out = fileHeader;
  for (const areaId of areas) {
    const areaData = data[areaId];
    const exportName = exportNames[areaId];
    out += "// ─── " + comments[areaId] + " ───────────────────────────────────────────

";
    out += "export const " + exportName + ": ModuleDefinition[] = [
";
    for (const m of areaData.modules) { out += genModule(m) + "
"; }
    out += "];

";
  }
  out += "// Combined export for constants.ts
export const " + combinedExport + ": ModuleDefinition[] = [
";
  for (const areaId of areas) { out += "  ..." + exportNames[areaId] + ",
"; }
  out += "];
";
  return out;
}
