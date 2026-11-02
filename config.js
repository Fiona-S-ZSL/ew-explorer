// config.js ---------------------------------------------------------------
// The ONLY file you normally need to edit to change where the data comes from.
//
// Option 1 (default): files uploaded next to index.html. To update the site,
//   replace data/data_input_public.csv (and data/common_names.csv) with new exports.
//
// Option 2 (recommended for contributors): a Google Sheet published as CSV.
//   File > Share > Publish to web > pick the tab > "Comma-separated values (.csv)"
//   and paste the link below. Edits to the sheet appear on the site within a few
//   minutes, with no uploading and no rebuild.
window.EW_CONFIG = {
  // Master species table (same columns as the IUCN export).
  masterCsv: "data/data_input_public.csv",
  // e.g. "https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?gid=0&single=true&output=csv"

  // Common-name lookup (columns: scientific_name, common_name). Optional: if the
  // master table has a "commonName" column that is used instead.
  commonNamesCsv: "data/common_names.csv",

  // If the live source fails to load, fall back to the uploaded files.
  fallbackMasterCsv: "data/data_input_public.csv",
  fallbackCommonNamesCsv: "data/common_names.csv",

  // Sections of the species detail page to hide until data permissions are
  // cleared. Options: "assessment", "narrative", "exsitu", "years" (assessment
  // years in the species table, find-a-species card and analytics chart).
  // Remove a name from the list to show that section again.
  hiddenSections: ["assessment", "narrative", "exsitu", "years"],

  // Link shown in the header of the page.
  iucnUrl: "https://www.iucnredlist.org/search?redListCategory=ew"
};
