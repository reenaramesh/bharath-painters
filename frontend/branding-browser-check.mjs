export default async function run(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173/login");
  await page.getByRole("heading", { name: "Manage every service project from lead to finish." }).waitFor();
  return await page.evaluate(() => ({
    width: innerWidth,
    title: document.title,
    heading: document.querySelector("h1")?.innerText,
    platformVisible: document.body.innerText.includes("Bharath Apps"),
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
  }));
}
