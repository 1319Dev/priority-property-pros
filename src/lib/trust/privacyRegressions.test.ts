import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canReadCustomerContact, canReadExactAddress, type MarketplaceActor } from "../marketplace/privacy";
import { isDirectoryListedContractor } from "../marketplace/publicDirectory";
import { canAppearInPublicDirectory } from "./restrictions";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function walkSrc(): string {
  const walk = (dir: string, acc: string[] = []): string[] => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const next = path.join(dir, name.name);
      if (name.isDirectory()) {
        if (name.name === "admin") continue;
        walk(next, acc);
      } else if (/\.(ts|tsx)$/.test(name.name) && !/\.test\.(ts|tsx)$/.test(name.name)) {
        acc.push(readFileSync(next, "utf8"));
      }
    }
    return acc;
  };
  return walk(path.join(repoRoot, "src/pages")).join("\n") + walk(path.join(repoRoot, "src/features")).join("\n");
}

describe("privacy and copy regressions for #11/#14/#16", () => {
  it("still hides private contact without a connection and keeps public listings ACTIVE-only", () => {
    const pro: MarketplaceActor = {
      id: "pro-user",
      accountType: "CONTRACTOR",
      accountStatus: "ACTIVE",
      contractorProfileId: "pro-1",
    };
    expect(
      canReadExactAddress(pro, { customer_id: "cust", selected_contractor_profile_id: "pro-1" }, "CONFIRMED", "LOCKED"),
    ).toBe(false);
    expect(
      canReadCustomerContact(pro, "cust", {
        bookingStatus: "CONFIRMED",
        selectedContractorProfileId: "pro-1",
        contactAccess: "LOCKED",
      }),
    ).toBe(false);
    expect(isDirectoryListedContractor({ approvalStatus: "APPROVED", accountStatus: "SUSPENDED" })).toBe(false);
    expect(canAppearInPublicDirectory({ approvalStatus: "APPROVED", accountStatus: "DELETED_ANONYMIZED" })).toBe(false);
  });

  it("removes developer jargon from homeowner and contractor screens", () => {
    const ui = walkSrc();
    expect(ui).not.toMatch(/contact entitlement/i);
    expect(ui).not.toMatch(/\bRLS\b/);
    expect(ui).not.toMatch(/\bRPC\b/);
    expect(ui).not.toMatch(/state-machine/i);
    expect(ui).not.toMatch(/stored in the database/i);
  });
});
