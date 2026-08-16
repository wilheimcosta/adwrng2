import { describe, it, expect } from "vitest";
import {
  extractIcaosFromAdWarning,
  hasMetarForHour,
  hasSynopForHour,
  isMetarWatchMinute,
  isPendingAlertStale,
  isSynopticPublicationHour,
  mapFlightRuleFromFlag,
  metarHourKeyFromReportText,
  nextSynopticHourDate,
  toUtcHourKey,
} from "@/lib/redemet";

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

describe("OPMET watch helpers", () => {
  const metar = (mens: string, validadeInicial: string) => ({
    mens,
    validade_inicial: validadeInicial,
  });
  const synop = (validadeInicial: string) => ({
    mens: "AAXX 11124 82098 11160 22200 2//// ///// 333 55399",
    validade_inicial: validadeInicial,
  });

  it("detects the METAR watch minute window", () => {
    expect(isMetarWatchMinute(55)).toBe(true);
    expect(isMetarWatchMinute(59)).toBe(true);
    expect(isMetarWatchMinute(54)).toBe(false);
    expect(isMetarWatchMinute(0)).toBe(false);
  });

  it("identifies synoptic publication hours", () => {
    [0, 3, 6, 9, 12, 15, 18, 21].forEach((hour) =>
      expect(isSynopticPublicationHour(hour)).toBe(true),
    );
    [1, 2, 4, 5, 22, 23].forEach((hour) =>
      expect(isSynopticPublicationHour(hour)).toBe(false),
    );
  });

  it("computes the next synoptic hour with day rollover", () => {
    expect(nextSynopticHourDate(new Date(Date.UTC(2026, 7, 11, 2, 55))).toISOString())
      .toBe("2026-08-11T03:00:00.000Z");
    expect(nextSynopticHourDate(new Date(Date.UTC(2026, 7, 11, 3, 10))).toISOString())
      .toBe("2026-08-11T06:00:00.000Z");
    expect(nextSynopticHourDate(new Date(Date.UTC(2026, 7, 11, 23, 55))).toISOString())
      .toBe("2026-08-12T00:00:00.000Z");
  });

  it("detects when the target hour METAR is present in OPMET data", () => {
    const items = [
      metar("METAR SBMQ 111500Z 26012KT 9999 SCT025 33/24 Q1011", "2026-08-11 15:10:00"),
      metar("METAR SBMQ 111600Z 26014KT 9999 SCT025 33/24 Q1011", "2026-08-11 16:06:00"),
    ];
    expect(hasMetarForHour(items, toUtcHourKey(new Date(Date.UTC(2026, 7, 11, 16))))).toBe(true);
    expect(hasMetarForHour(items, toUtcHourKey(new Date(Date.UTC(2026, 7, 11, 17))))).toBe(false);
  });

  it("does not treat a SPECI as the hourly METAR", () => {
    const items = [metar("SPECI SBMQ 111545Z 26020KT 4000 TSRA SCT020", "2026-08-11 15:50:00")];
    expect(hasMetarForHour(items, "2026081116")).toBe(false);
  });

  it("accepts METAR COR as the hourly METAR", () => {
    const items = [metar("METAR COR SBMQ 111600Z 26014KT 9999 SCT025", "2026-08-11 16:10:00")];
    expect(hasMetarForHour(items, "2026081116")).toBe(true);
  });

  it("returns false for empty METAR data", () => {
    expect(hasMetarForHour([], "2026081116")).toBe(false);
  });

  it("detects when the target hour SYNOP is present in OPMET data", () => {
    expect(hasSynopForHour([synop("2026-08-11 12:00:00")], "2026081112")).toBe(true);
    expect(hasSynopForHour([synop("2026-08-11 12:00:00")], "2026081115")).toBe(false);
    expect(hasSynopForHour([], "2026081112")).toBe(false);
  });

  it("matches the METAR by the report hour even when published late", () => {
    const items = [
      metar("METAR SBMQ 111500Z 26012KT 9999 SCT025 33/24 Q1011", "2026-08-11 16:05:00"),
    ];
    expect(hasMetarForHour(items, "2026081115")).toBe(true);
    expect(hasMetarForHour(items, "2026081116")).toBe(false);
  });

  it("falls back to the validity time when the report has no DDHHMMZ", () => {
    const items = [metar("METAR SBMQ 26012KT 9999 SCT025", "2026-08-11 16:05:00")];
    expect(hasMetarForHour(items, "2026081116")).toBe(true);
    expect(hasMetarForHour(items, "2026081115")).toBe(false);
  });

  it("computes the next synoptic hour from an exact synoptic hour", () => {
    expect(nextSynopticHourDate(new Date(Date.UTC(2026, 7, 11, 3, 0))).toISOString())
      .toBe("2026-08-11T06:00:00.000Z");
  });

  it("rejects out-of-range minutes in the watch window", () => {
    expect(isMetarWatchMinute(60)).toBe(false);
    expect(isMetarWatchMinute(-1)).toBe(false);
  });

  it("detects stale pending alerts", () => {
    expect(isPendingAlertStale(null, Date.now(), 30_000)).toBe(false);
    expect(isPendingAlertStale(1000, 1000 + 30_001, 30_000)).toBe(true);
    expect(isPendingAlertStale(1000, 1000 + 30_000, 30_000)).toBe(false);
  });

  it("matches the target hour METAR even when published as SPECI", () => {
    const items = [
      metar("SPECI SBMQ 111500Z 26012KT 9999 SCT025", "2026-08-11 14:55:00"),
    ];
    expect(hasMetarForHour(items, "2026081115")).toBe(true);
    expect(hasMetarForHour(items, "2026081116")).toBe(false);
  });

  it("matches SYNOP by the observation hour in the message when validity is the publication time", () => {
    const items = [
      { mens: "AAXX 11154 82098 11160 22200 2//// ///// 333 55399", validade_inicial: "2026-08-11 14:55:00" },
    ];
    expect(hasSynopForHour(items, "2026081115")).toBe(true);
    expect(hasSynopForHour(items, "2026081116")).toBe(false);
  });

  it("flags the next synoptic hour as available when its SYNOP was published early", () => {
    const utcNow = new Date(Date.UTC(2026, 7, 11, 20, 56));
    const nextKey = toUtcHourKey(nextSynopticHourDate(utcNow));
    const items = [
      { mens: "AAXX 11214 82098 11160 22200 2//// ///// 333 55399", validade_inicial: "2026-08-11 20:56:00" },
    ];
    expect(nextKey).toBe("2026081121");
    expect(hasSynopForHour(items, nextKey)).toBe(true);
  });

  it("extracts the METAR hour key from the aerodrome status text", () => {
    const text =
      "METAR SBMQ 160200Z 02007KT 9999 FEW023 28/24 Q1013=\n\n" +
      "TAF SBMQ 152102Z 1600/1624 06010KT 9999 SCT020 TN26/1609Z TX33/1618Z \nTEMPO 1602/1612 36007KT RMK PHI=\n\n" +
      "Não há aviso para a localidade SBMQ";
    const reference = new Date("2026-08-16T02:10:00Z");
    expect(metarHourKeyFromReportText(text, reference)).toBe("2026081602");
  });

  it("extracts the METAR hour key from a SPECI status text", () => {
    expect(
      metarHourKeyFromReportText(
        "SPECI SBMQ 160205Z 02007KT 9999 FEW023 28/24 Q1013=",
        new Date("2026-08-16T02:10:00Z"),
      ),
    ).toBe("2026081602");
  });

  it("returns null when the status text has no METAR or SPECI line", () => {
    const reference = new Date("2026-08-16T02:10:00Z");
    expect(metarHourKeyFromReportText("Não há aviso para a localidade SBMQ", reference)).toBeNull();
    expect(
      metarHourKeyFromReportText("TAF SBMQ 152102Z 1600/1624 06010KT RMK PHI=", reference),
    ).toBeNull();
    expect(metarHourKeyFromReportText("", reference)).toBeNull();
  });
});
