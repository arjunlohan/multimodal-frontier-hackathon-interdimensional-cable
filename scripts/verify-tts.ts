/* eslint-disable no-console */
import { generateTts, deliveryStyleForHost, voiceForHost } from "../app/lib/tts";

const LINE = "France's longest land border is not with Spain or Germany. It is with Brazil.";

async function main() {
  console.log("=== VOICE + STYLE MAPPING ===");
  for (const h of ["John Oliver", "Seth Meyers", "Colin Jost", "Michael Che"]) {
    console.log(`  ${h.padEnd(14)} voice=${voiceForHost(h).padEnd(8)} style=${deliveryStyleForHost(h) ? "yes" : "NONE"}`);
  }

  console.log("\n=== SINGLE-HOST SYNTHESIS (John Oliver, British steering) ===");
  const t = Date.now();
  const wav = await generateTts(LINE, [{ name: "John Oliver", personality: "dry British satirist" }], "en");
  console.log(`  PASS  ${wav.length} bytes WAV in ${Date.now() - t}ms`);

  console.log("\n=== AUDIO DUBBING: all supported languages ===");
  for (const [code, name] of [["es","Spanish"],["fr","French"],["de","German"],["pt","Portuguese"],["ja","Japanese"]]) {
    const t2 = Date.now();
    try {
      const buf = await generateTts(LINE, [{ name: "John Oliver", personality: "host" }], code);
      console.log(`  PASS  ${code} (${name.padEnd(10)}) ${buf.length} bytes in ${Date.now() - t2}ms`);
    } catch (e: any) {
      console.log(`  FAIL  ${code} (${name.padEnd(10)}) ${String(e.message).slice(0, 110)}`);
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
