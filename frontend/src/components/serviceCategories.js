export const SERVICE_CATEGORIES = [
  ["Painting", "painting"], ["Plumbing", "plumbing"], ["Electrical", "electrical"],
  ["Carpentry", "carpentry"], ["Cleaning", "cleaning"], ["Waterproofing", "waterproofing"],
  ["False ceiling", "false-ceiling"],
].map(([label, id]) => ({ id, label, artwork: id, search: label }));
