import { Pool } from "pg";
import fs from "node:fs";
import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0,l.indexOf("=")), l.slice(l.indexOf("=")+1)]));
const enc = k => { const key = createHash("sha256").update(env.KEY_ENCRYPTION_SECRET).digest();
  const iv = randomBytes(12); const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(k),"utf8"), c.final()]);
  return [iv, c.getAuthTag(), ct].map(b=>b.toString("base64url")).join(":"); };

const pool = new Pool({ connectionString: fs.readFileSync(".cloud-sql-prod-url","utf8").trim() });
const id = randomUUID();
const TOPIC = "Companies charging monthly subscriptions for features that used to come with the product";
await pool.query(`INSERT INTO generated_shows (id, template_id, topic, topic_type, duration_seconds,
  familiarity, use_frame_chaining, status, user_id, encrypted_api_keys)
  VALUES ($1,'79021e67-4360-4341-97ef-d05803236822',$2,'freetext',180,'familiar',false,'pending','default_user',$3)`,
  [id, TOPIC, enc({ vertexKey: env.GEMINI_API_KEY })]);
console.log("show:", id);
const r = await fetch("https://multimodal-frontier-hackathon-inter.vercel.app/api/workflows/generate-show",
  { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ showId: id }) });
console.log("dispatch:", r.status);

let last="";
for (let i=0;i<150;i++){
  const { rows:[s] } = await pool.query(
    "SELECT status,error,mux_playback_id,transcript_segments,research_context FROM generated_shows WHERE id=$1",[id]);
  const line = `${s.status}${s.error?" | "+s.error:""}`;
  if (line!==last){ console.log(new Date().toISOString().slice(11,19), line); last=line; }
  if (s.status==="ready"||s.status==="failed"){
    if (s.status==="ready"){
      const segs=s.transcript_segments||[];
      const speakers=[...new Set(segs.map(x=>x.speaker))];
      const runtime=segs.at(-1)?.endTimeSeconds??0;
      let brief=null; try{brief=JSON.parse(s.research_context);}catch{}
      const facts=brief?.groundedFacts??[];
      console.log("");
      console.log("  speakers   :", speakers.join(" | "), speakers.length===1?"[OK single voice]":"[FAIL >1 voice]");
      console.log("  segments   :", segs.length);
      console.log("  runtime    :", runtime.toFixed(1)+"s of 180s requested ("+Math.round(runtime/180*100)+"%)");
      console.log("  grounded   :", facts.length, "facts,", facts.filter(f=>f.sourceUrl).length, "with a live source");
      console.log("  fabricated :", facts.some(f=>(f.sourceUrl||"").includes("example.com"))?"YES":"no");
      console.log("  mux        :", s.mux_playback_id);
      console.log("");
      console.log("  opening lines:");
      segs.slice(0,4).forEach(x=>console.log("   "+String(x.startTimeSeconds).padStart(7)+"s  "+(x.text||"").slice(0,88)));
    }
    break;
  }
  await new Promise(r=>setTimeout(r,10000));
}
await pool.end();
