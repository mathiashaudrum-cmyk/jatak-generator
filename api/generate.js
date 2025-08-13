---

## 5️⃣ `api/generate.js`
```javascript
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    return;
  }

  try {
    const body = await new Promise((resolve, reject) => {
      let buf = "";
      req.on("data", (chunk) => (buf += chunk));
      req.on("end", () => {
        try {
          resolve(buf ? JSON.parse(buf) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on("error", reject);
    });

    const { product, price, unit, pickup_note = "", extra_note = "", tones = [], emojis = true } = body || {};

    const errors = [];
    if (!product) errors.push("product");
    if (!price) errors.push("price");
    if (!unit || !String(unit).startsWith("/")) errors.push("unit");
    if (errors.length) {
      res.status(400).json({ error: "Missing or invalid fields", fields: errors });
      return;
    }

    const systemPrompt = `Du skriver danske “ja tak”-tekster til Facebook for en dagligvarebutik. Følg reglerne nøje:

1) Åbning
- Start altid med: "Ja tak – <VARENAVN>" i starten af teksten.

2) Pris
- Format: "xx,xx kr./<enhed>" (komma som decimal, enhed er påkrævet: fx /kg, /stk, /pk).
- Ingen "kun", "vild pris" eller "spar".

3) Afhentning
- Brug præcis den fritekst, brugeren har skrevet, uden at opfinde nyt.
- Normalisér til én klar sætning (fx "Afhent senest torsdag kl. 17." eller "Afhent fra onsdag kl. 10 og senest torsdag.").
- Hvis teksten er tvetydig, skriv: Afhent: "<brugerens tekst>".

4) Øvrig info/billednote
- Bruges som kontekst til tone/ordvalg. Navne på medarbejdere må gerne indgå i teksten (fornavn/rolle; undgå fulde navne og følsomme oplysninger).

5) Toner & temaer (flere kan være valgt)
- Sjov: tydelig humor, interne jokes, ordspil.
- Neutral: nøgtern og faktuel.
- Alvorlig: formelt sprog, ingen humor.
- Premium/kvalitet: ord som "nøje udvalgt", "høj kvalitet" uden overdrivelse (ingen falske claims).
- Prisfokus: sæt prislinjen tydeligt i fokus (fx "Skærpet pris – 129,00 kr./kg").
- Lokal: tilføj en separat afsluttende linje i betydningen "Støt lokalt." (må varieres).
- Temaer: Jul, Påske, Sommer, Weekend, Kød, Bager, Frugt & grønt, Drikke. Brug relevante emojis og ordvalg, men sparsomme emojis.

6) Stil & længde
- Op til ca. 500 tegn (må være kortere). Ingen krav til antal linjer.
- Vare og pris skal fremgå tydeligt tidligt i teksten.
- Afhentningsinfo skal med, men må flettes ind naturligt.
- Ingen overbud, falske claims eller før/nu-priser.

7) Sprog
- Dansk, almindelig butikstone, tilpas efter valgte toner/temaer.

8) Hashtags
- Afslut altid med "#superbrugsenjels #jatak" plus relevante ekstra hashtags baseret på indholdet og de valgte toner/temaer.`;

    const userContent = [
      `Varenavn: ${product}`,
      `Pris: ${price}`,
      `Enhed: ${unit}`,
      pickup_note ? `Afhentning (fri tekst): ${pickup_note}` : ``,
      extra_note ? `Øvrig info/billednote: ${extra_note}` : ``,
      tones?.length ? `Toner/Temaer: ${tones.join(", ")}` : `Toner/Temaer: (ingen valgt)`,
      `Emojis: ${emojis ? "tilladt" : "ikke tilladt"}`
    ]
      .filter(Boolean)
      .join("\n");

    if (process.env.LOG_PROMPTS === "1") {
      console.log("=== SYSTEM PROMPT ===\n" + systemPrompt);
      console.log("=== USER CONTENT ===\n" + userContent);
    }

    const schema = {
      name: "OfferText",
      schema: {
        type: "object",
        properties: {
          bodyText: { type: "string", description: "Samlet tekst, klar til copy/paste." },
          extraHashtags: { type: "array", items: { type: "string" } },
          debug: { type: "object", properties: { normalizedPickup: { type: "string" } } }
        },
        required: ["bodyText"]
      },
      strict: true
    };

    const payload = {
      model: "gpt-4.1",
      temperature: 0.5,
      response_format: { type: "json_schema", json_schema: schema },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ]
    };

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("OpenAI error", resp.status, t);
      res.status(502).json({ error: "OpenAI API error", detail: t });
      return;
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "";
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { bodyText: content, extraHashtags: [] };
    }

    const baseTags = ["#superbrugsenjels", "#jatak"];
    const extraTags = Array.isArray(parsed.extraHashtags) ? parsed.extraHashtags : [];
    const allTags = Array.from(new Set([...baseTags, ...extraTags]));

    let finalText = (parsed.bodyText || "").trim();
    const lower = finalText.toLowerCase();
    const containsBase = baseTags.every((t) => lower.includes(t.toLowerCase()));
    if (!containsBase) finalText = `${finalText}\n\n${allTags.join(" ")}`.trim();

    res.status(200).json({
      text: finalText,
      bodyText: parsed.bodyText || "",
      extraHashtags: extraTags
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server failure", detail: String(e) });
  }
}
