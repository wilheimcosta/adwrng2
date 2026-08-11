import { describe, it, expect } from "vitest";
import { extractIcaosFromAdWarning, mapFlightRuleFromFlag } from "@/lib/redemet";

describe("REDEMET helpers", () => {
  it("maps the published flight-rule flags", () => {
    expect(mapFlightRuleFromFlag("g")).toBe("VFR");
    expect(mapFlightRuleFromFlag("y")).toBe("IFR");
    expect(mapFlightRuleFromFlag("r")).toBe("LIFR");
    expect(mapFlightRuleFromFlag("unknown")).toBeNull();
  });

  it("extracts only aerodromes from the warning header", () => {
    expect(extractIcaosFromAdWarning("SBMQ SBBE AD WRNG 12 VALID 101200/101800 WSPD 30KT"))
      .toEqual(["SBMQ", "SBBE"]);
  });
});
