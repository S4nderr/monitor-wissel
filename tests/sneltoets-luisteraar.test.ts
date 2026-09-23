import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { normaliseerToets, SneltoetsLuisteraar, type LuisteraarKind, type SpawnFn } from "../src/sneltoets-luisteraar.js";

/** Nepkindproces: stdout/stderr zijn echte streams, kill() laat het proces "eindigen". */
class NepKind extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  gedood = false;
  kill(): boolean {
    this.gedood = true;
    this.emit("exit", null, "SIGTERM");
    return true;
  }
}

function nepLogger() {
  const regels: string[] = [];
  return { regels, info: (m: string) => regels.push(m), warn: (m: string) => regels.push(m) };
}

function maak() {
  const kinderen: NepKind[] = [];
  const spawnFn = vi.fn<SpawnFn>(() => {
    const kind = new NepKind();
    kinderen.push(kind);
    return kind as unknown as LuisteraarKind;
  });
  const logger = nepLogger();
  const luisteraar = new SneltoetsLuisteraar("C:\\plugin\\ps\\sneltoets-luisteraar.ps1", logger, spawnFn);
  const drukken: string[] = [];
  luisteraar.bijToets((context) => drukken.push(context));
  opruimen = () => luisteraar.stop();
  return { luisteraar, spawnFn, kinderen, logger, drukken };
}

/** Laat de stream-events (die asynchroon lopen) eerst afgaan. */
const wacht = () => new Promise((los) => setImmediate(los));

let opruimen: (() => void) | undefined;
afterEach(() => {
  opruimen?.();
  opruimen = undefined;
});

describe("normaliseerToets", () => {
  it("accepteert F13 t/m F24 ongeacht hoofdletters en spaties", () => {
    expect(normaliseerToets(" f21 ")).toBe("F21");
    expect(normaliseerToets("F13")).toBe("F13");
    expect(normaliseerToets("F24")).toBe("F24");
  });

  it("weigert leeg en andere toetsen", () => {
    expect(normaliseerToets(undefined)).toBeUndefined();
    expect(normaliseerToets("")).toBeUndefined();
    expect(normaliseerToets("F12")).toBeUndefined();
    expect(normaliseerToets("F25")).toBeUndefined();
  });
});

describe("SneltoetsLuisteraar", () => {
  it("start geen proces zonder toetsen", () => {
    const { luisteraar, spawnFn } = maak();
    luisteraar.stel(new Map());
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it("start PowerShell onzichtbaar met de eigen pid en het paar toets=context", () => {
    const { luisteraar, spawnFn } = maak();
    luisteraar.stel(new Map([["F21", "ctx1"]]));
    expect(spawnFn).toHaveBeenCalledTimes(1);
    const [bestand, args, opties] = spawnFn.mock.calls[0];
    expect(bestand).toBe("powershell.exe");
    expect(args).toEqual([
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "C:\\plugin\\ps\\sneltoets-luisteraar.ps1",
      String(process.pid),
      "F21=ctx1",
    ]);
    expect(opties).toMatchObject({ windowsHide: true });
  });

  it("geeft een regel op stdout door als context, ook als die in stukken binnenkomt", async () => {
    const { luisteraar, kinderen, drukken, logger } = maak();
    luisteraar.stel(new Map([["F21", "ctx1"]]));
    const kind = kinderen[0];
    kind.stdout.write("klaar\r\n");
    kind.stdout.write("ctx1\n");
    await wacht();
    expect(drukken).toEqual(["ctx1"]);
    expect(logger.regels.join("\n")).toContain("sneltoets-luisteraar gestart (toetsen: F21)");
    kind.stdout.write("ct");
    await wacht();
    expect(drukken).toEqual(["ctx1"]);
    kind.stdout.write("x2\r\n");
    await wacht();
    expect(drukken).toEqual(["ctx1", "ctx2"]);
  });

  it("start niet opnieuw bij dezelfde toetsen, wel bij andere", () => {
    const { luisteraar, spawnFn, kinderen } = maak();
    luisteraar.stel(new Map([["F21", "ctx1"], ["F22", "ctx2"]]));
    // Zelfde inhoud in een andere volgorde en schrijfwijze: niets te doen.
    luisteraar.stel(new Map([["f22", "ctx2"], ["F21", "ctx1"]]));
    expect(spawnFn).toHaveBeenCalledTimes(1);
    luisteraar.stel(new Map([["F21", "ctx1"]]));
    expect(spawnFn).toHaveBeenCalledTimes(2);
    expect(kinderen[0].gedood).toBe(true);
    expect(kinderen[1].gedood).toBe(false);
    expect(spawnFn.mock.calls[1][1]).toContain("F21=ctx1");
    expect(spawnFn.mock.calls[1][1]).not.toContain("F22=ctx2");
  });

  it("stopt het proces als er geen toetsen meer zijn", () => {
    const { luisteraar, kinderen, spawnFn } = maak();
    luisteraar.stel(new Map([["F21", "ctx1"]]));
    luisteraar.stel(new Map());
    expect(kinderen[0].gedood).toBe(true);
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  it("stop() doodt het proces", () => {
    const { luisteraar, kinderen } = maak();
    luisteraar.stel(new Map([["F21", "ctx1"]]));
    luisteraar.stop();
    expect(kinderen[0].gedood).toBe(true);
  });

  it("meldt een onverwacht einde en start bij de volgende stel opnieuw, ook met dezelfde toetsen", () => {
    const { luisteraar, kinderen, spawnFn, logger } = maak();
    luisteraar.stel(new Map([["F21", "ctx1"]]));
    kinderen[0].emit("exit", 1, null);
    expect(logger.regels.join("\n")).toContain("sneltoets-luisteraar gestopt (code 1)");
    luisteraar.stel(new Map([["F21", "ctx1"]]));
    expect(spawnFn).toHaveBeenCalledTimes(2);
  });

  it("meldt geen onverwacht einde voor een proces dat zij zelf stopte", () => {
    const { luisteraar, logger } = maak();
    luisteraar.stel(new Map([["F21", "ctx1"]]));
    luisteraar.stel(new Map([["F22", "ctx1"]]));
    expect(logger.regels.join("\n")).not.toContain("gestopt (code");
  });

  it("slaat een ongeldige toets of een onveilig id over", () => {
    const { luisteraar, spawnFn, logger } = maak();
    luisteraar.stel(
      new Map([
        ["F12", "ctx1"],
        ["F21", "ctx 2"],
      ]),
    );
    expect(spawnFn).not.toHaveBeenCalled();
    expect(logger.regels.join("\n")).toContain("overgeslagen");
  });

  it("zet stderr van het script in het log", async () => {
    const { luisteraar, kinderen, logger } = maak();
    luisteraar.stel(new Map([["F21", "ctx1"]]));
    kinderen[0].stderr.write("geen toetsen om te bewaken\r\n");
    await wacht();
    expect(logger.regels.join("\n")).toContain("sneltoets-luisteraar: geen toetsen om te bewaken");
  });
});
