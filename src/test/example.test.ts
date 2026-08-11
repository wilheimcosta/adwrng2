import { describe, it, expect } from "vitest";
import { extractIcaosFromAdWarning, mapFlightRuleFromFlag } from "@/lib/redemet";

describe("REDEMET helpers", () => {
  it("maps the published flight-rule flags", () => {
    expect(mapFlightRuleFromFlag("g")).toBe("VFR");
    expect(mapFlightRuleFromFlag("y")).toBe("IFR");
    expect(mapFlightRuleFromFlag("r")).toBe("LIFR");
    expect(mapFlightRuleFromFlag("unknown")).toBeNull();
  });

  it("maps flight-rule flags case-insensitively", () => {
    expect(mapFlightRuleFromFlag("G")).toBe("VFR");
    expect(mapFlightRuleFromFlag("Y")).toBe("IFR");
    expect(mapFlightRuleFromFlag("R")).toBe("LIFR");
  });

  it("returns null for missing or invalid flight-rule flags", () => {
    expect(mapFlightRuleFromFlag(null)).toBeNull();
    expect(mapFlightRuleFromFlag(undefined)).toBeNull();
    expect(mapFlightRuleFromFlag("")).toBeNull();
    expect(mapFlightRuleFromFlag(0)).toBeNull();
    expect(mapFlightRuleFromFlag("VFR")).toBeNull();
  });

  it("extracts only aerodromes from the warning header", () => {
    expect(extractIcaosFromAdWarning("SBMQ SBBE AD WRNG 12 VALID 101200/101800 WSPD 30KT"))
      .toEqual(["SBMQ", "SBBE"]);
  });

  it("returns an empty array for empty warning text", () => {
    expect(extractIcaosFromAdWarning("")).toEqual([]);
    expect(extractIcaosFromAdWarning("   ")).toEqual([]);
    expect(extractIcaosFromAdWarning(null)).toEqual([]);
  });

  it("normalizes lowercase ICAO codes to uppercase", () => {
    expect(extractIcaosFromAdWarning("sbMQ sBBe AD WRNG 1 VALID 101200/101800"))
      .toEqual(["SBMQ", "SBBE"]);
  });

  it("deduplicates repeated ICAO codes", () => {
    expect(extractIcaosFromAdWarning("SBMQ SBMQ SBPA SBMQ AD WRNG 3"))
      .toEqual(["SBMQ", "SBPA"]);
  });

  it("ignores codes listed after the AD WRNG marker", () => {
    expect(extractIcaosFromAdWarning("SBMQ SBPA AD WRNG 5 VALID 101200/101800 SBBE SBGR"))
      .toEqual(["SBMQ", "SBPA"]);
  });

  it("extracts every four-letter code when no AD WRNG marker is present", () => {
    expect(extractIcaosFromAdWarning("SBMQ SBPA SBBE")).toEqual(["SBMQ", "SBPA", "SBBE"]);
  });

  it("ignores non-ICAO tokens such as numbers", () => {
    expect(extractIcaosFromAdWarning("SBMQ AD WRNG 12 VALID 101200/101800 WSPD 30KT"))
      .toEqual(["SBMQ"]);
  });
});
