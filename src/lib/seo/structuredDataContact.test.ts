import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..", "..");
const EMAIL = /support@prioritypropertypros\.com/i;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("structured data and static files keep the support email off the site", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");

  it("index.html has no support email or mailto link", () => {
    expect(html).not.toMatch(EMAIL);
    expect(html).not.toMatch(/mailto:/i);
  });

  it("Organization JSON-LD points to the Contact Us page instead of an email", () => {
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const data = JSON.parse(match![1]);
    const org = data["@graph"].find((node: { "@type": string }) => node["@type"] === "Organization");
    expect(org.email).toBeUndefined();
    expect(org.contactPoint.url).toBe("https://prioritypropertypros.com/contact");
  });

  it("public text files have no support email", () => {
    for (const file of walk(join(root, "public")).filter((f) => /\.(html|xml|txt|json|svg|webmanifest)$/.test(f))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(EMAIL);
    }
  });
});
