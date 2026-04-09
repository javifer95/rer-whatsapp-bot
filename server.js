import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ── CONFIGURATION ──────────────────────────────────────────────
const VERIFY_TOKEN    = "rer_burgers_secret_2024";
const WA_TOKEN        = process.env.WA_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ANTHROPIC_KEY   = process.env.ANTHROPIC_KEY;

// ── MEMORY: remember each customer's conversation ──────────────
const conversations = {};

// ── WEBHOOK VERIFICATION ───────────────────────────────────────
app.get("/webhook", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified by Meta!");
    res.status(200).send(challenge);
  } else {
    console.log("❌ Webhook verification failed");
    res.sendStatus(403);
  }
});

// ── RECEIVE MESSAGES ───────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  try {
    const entry   = req.body?.entry?.[0];
    const change  = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (!message || message.type !== "text") {
      return res.sendStatus(200);
    }

    const userPhone = message.from;
    const userText  = message.text.body;

    console.log(`📩 Message from ${userPhone}: ${userText}`);

    if (!conversations[userPhone]) {
      conversations[userPhone] = [];
    }
    conversations[userPhone].push({ role: "user", content: userText });

    const replyText = await askClaude(conversations[userPhone]);

    conversations[userPhone].push({ role: "assistant", content: replyText });

    if (conversations[userPhone].length > 20) {
      conversations[userPhone] = conversations[userPhone].slice(-20);
    }

    await sendWhatsAppMessage(userPhone, replyText);

    console.log(`📤 Replied to ${userPhone}: ${replyText}`);
    res.sendStatus(200);

  } catch (error) {
    console.error("❌ Error handling message:", error);
    res.sendStatus(500);
  }
});

// ── ASK CLAUDE ─────────────────────────────────────────────────
async function askClaude(conversationHistory) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 350,
      system: `Eres el asistente virtual de RER Burgers 🍔, un restaurante de hamburguesas artesanales ubicado en Spazio, Guatemala City.

Tu personalidad: amigable, entusiasta con la comida, breve y claro. Usas algún emoji ocasionalmente.

━━━ HORARIOS ━━━
- Lunes – Miércoles: 11:00 AM – 8:00 PM
- Jueves:            12:00 PM – 9:00 PM
- Viernes:           11:00 AM – 8:00 PM
- Sábado:            12:00 PM – 9:00 PM
- Domingo:           11:30 AM – 6:00 PM

━━━ MENÚ ━━━
Hamburguesas:
- The Melt           Q116  — house blend, provolone, suizo, arugula, salsa RER
- Shroom Burger      Q116  — hongos, queso, salsa especial
- Walker             Q114  — clásica con un toque RER
- The All in Burger  Q110  — la más completa
- Steak Burger       Q100  — carne de res premium
- La Francesa        Q115  — estilo francés
- The Tearmaker      Q114  — picante, para los valientes 🌶️
- Egg Classic Burger Q114  — con huevo estrellado
- Crispy Chicken     Q116  — pollo crujiente
- Turkey Melt        Q85   — de pavo, más ligera
- Mini Slider        Q70   — perfecta para antojitos

Combos / Extras:
- RER's Rockstars Sampler  Q135  — variedad de mini burgers

━━━ PEDIDOS ━━━
También disponibles por Uber Eats.
Para pedidos por aquí: pregunta qué desean, confirma el pedido y diles que en breve un agente los contactará para coordinar el pago y entrega.

━━━ CONTACTO ━━━
Teléfono: +502 3569-5505
Ubicación: Spazio, Guatemala City

━━━ REGLAS ━━━
1. Responde SIEMPRE en español.
2. Si no sabes algo, di "No tengo esa información, pero puedes llamarnos al +502 3569-5505".
3. Nunca inventes precios o platos que no estén en el menú.
4. Sé breve: máximo 3-4 líneas por respuesta.`,
      messages: conversationHistory
    })
  });

  const data = await response.json();

  if (data.error) {
    console.error("Claude API error:", data.error);
    return "Disculpa, tuve un problema técnico. Por favor llámanos al +502 3569-5505 🙏";
  }

  return data.content[0].text;
}

// ── SEND WHATSAPP MESSAGE ───────────────────────────────────────
async function sendWhatsAppMessage(to, text) {
  const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WA_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: { body: text }
    })
  });

  const data = await response.json();
  if (data.error) {
    console.error("WhatsApp send error:", data.error);
  }
}

// ── START THE SERVER ────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🍔 RER WhatsApp Bot is running on port ${PORT}`);
});