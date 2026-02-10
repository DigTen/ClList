import fs from "node:fs";
import path from "node:path";

const checks = [
  {
    file: "src/App.tsx",
    snippets: [
      "lazy(() => import(\"./pages/Calendar\")",
      "function RouteFallback()",
      "<LazyRoute>",
    ],
    label: "Route-level lazy loading",
  },
  {
    file: "src/pages/Calendar.tsx",
    snippets: [
      "const createdAtCompare = (a.created_at ?? \"\").localeCompare(b.created_at ?? \"\")",
      "week-bed-lane-${bedType}",
      "week-session-status-${statusOption}",
    ],
    label: "Calendar stability + visual hooks",
  },
  {
    file: "src/components/AddSessionDialog.tsx",
    snippets: ["initialBedType?: AttendanceBedType", "setBedType(initialBedType ?? \"reformer\")"],
    label: "Bed preselection in dialog",
  },
  {
    file: "src/pages/Payments.tsx",
    snippets: ["handleCopyPreviousMonth", "copyCandidates.length"],
    label: "Payments copy previous month",
  },
];

let failed = false;

for (const check of checks) {
  const filePath = path.resolve(process.cwd(), check.file);
  if (!fs.existsSync(filePath)) {
    console.error(`[FAIL] ${check.label}: file not found (${check.file})`);
    failed = true;
    continue;
  }

  const content = fs.readFileSync(filePath, "utf8");
  const missing = check.snippets.filter((snippet) => !content.includes(snippet));

  if (missing.length > 0) {
    console.error(`[FAIL] ${check.label}: missing ${missing.length} snippet(s) in ${check.file}`);
    for (const snippet of missing) {
      console.error(`  - ${snippet}`);
    }
    failed = true;
  } else {
    console.log(`[OK] ${check.label}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log("Regression smoke checks passed.");