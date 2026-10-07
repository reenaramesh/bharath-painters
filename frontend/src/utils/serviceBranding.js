const LEGACY_PAINTING_NAMES = new Set(["paint", "painting", "paint services", "painting services"]);

export function serviceBranding(category = {}) {
  const name = String(category.name || "Service").trim();
  const isPainting = LEGACY_PAINTING_NAMES.has(name.toLowerCase());
  let workspaceName = category.workspace_name || name;
  if (workspaceName === "Bharath Painters" && !isPainting) workspaceName = `Bharath ${name} Services`;

  let contractorLabel = category.contractor_label || "Contractor";
  if (contractorLabel === "Painter" && !isPainting) contractorLabel = `${name} Contractor`;

  let employeeSingularLabel = category.employee_singular_label || "Employee";
  let employeePluralLabel = category.employee_plural_label || "Employees";
  if (!isPainting && employeeSingularLabel === "Employee" && employeePluralLabel === "Employees") {
    if (name.toLowerCase().endsWith("ing")) {
      employeeSingularLabel = `${name.slice(0, -3)}er`;
      employeePluralLabel = `${employeeSingularLabel}s`;
    } else {
      employeeSingularLabel = `${name} professional`;
      employeePluralLabel = `${name} professionals`;
    }
  }

  return { workspaceName, contractorLabel, employeeSingularLabel, employeePluralLabel };
}
