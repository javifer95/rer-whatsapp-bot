const express = require('express');
const https = require('https');
const app = express();
app.use(express.json());

const VERIFY_TOKEN    = "rer_burgers_secret_2024";
const WA_TOKEN        = process.env.WA_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ANTHROPIC_KEY   = process.env.ANTHROPIC_KEY;

const conversations = {};

app.get('/', (req, res) => {
  res.send('RER Bot is alive!');
});

app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  try {
    const entry   = req.body && req.body.entry && req.body.entry[0];
    const change  = entry && entry.changes && entry.changes[0];
    const message = change && change.value && change.value.messages && change.value.messages[0];

    if (!message || message.type !== 'text') return res.sendStatus(200);

    const userPhone = message.from;
    const userText  = message.text.body;

    console.log('📩 Message from ' + userPhone + ': ' + userText);

    if (!conversations[userPhone]) conversations[userPhone] = [];
    conversations[userPhone].push({ role: 'user', content: userText });

    if (conversations[userPhone].length > 20) {
      conversations[userPhone] = conversations[userPhone].slice(-20);
    }

    const replyText = await askClaude(conversations[userPhone]);
    conversations[userPhone].push({ role: 'assistant', content: replyText });

    await sendWhatsAppMessage(userPhone, replyText);
    console.log('📤 Replied: ' + replyText);
    res.sendStatus(200);

  } catch (error) {
    console.error('❌ Error:', error);
    res.sendStatus(500);
  }
});

function askClaude(conversationHistory) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 350,
      system: `Eres el asistente virtual de RER Burgers 🍔, un restaurante de hamburguesas artesanales ubicado en Spazio, Guatemala City.

Tu personalidad: amigable, entusiasta con la comida, breve y claro. Usas algún emoji ocasionalmente.

HORARIOS:
- Lunes a Miércoles: 11:00 AM – 8:00 PM
- Jueves: 12:00 PM – 9:00 PM
- Viernes: 11:00 AM – 8:00 PM
- Sábado: 12:00 PM – 9:00 PM
- Domingo: 11:30 AM – 6:00 PM

MENÚ:
- The Melt Q116
- Shroom Burger Q116
- Walker Q114
- The All in Burger Q110
- Steak Burger Q100
- La Francesa Q115
- The Tearmaker Q114
- Egg Classic Burger Q114
- Crispy Chicken Q116
- Turkey Melt Q85
- Mini Slider Q70
- RER Rockstars Sampler Q135

PEDIDOS: También por Uber Eats. Para pedidos aquí, toma el pedido y diles que un agente los contactará pronto.
CONTACTO: +502 3569-5505 — Spazio, Guatemala City

REGLAS:
1. Responde SIEMPRE en español.
2. Si no sabes algo di: llámanos al +502 3569-5505
3. Nunca inventes precios.
4. Máximo 3-4 líneas por respuesta.`,
      messages: conversationHistory
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res2) => {
      let data = '';
      res2.on('data', chunk => data += chunk);
      res2.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            console.error('Claude error:', parsed.error);
            resolve('Disculpa, tuve un problema. Llámanos al +502 3569-5505 🙏');
          } else {
            resolve(parsed.content[0].text);
          }
        } catch(e) {
          resolve('Disculpa, tuve un problema. Llámanos al +502 3569-5505 🙏');
        }
      });
    });

    req.on('error', (e) => {
      console.error('Request error:', e);
      resolve('Disculpa, tuve un problema. Llámanos al +502 3569-5505 🙏');
    });

    req.write(body);
    req.end();
  });
}

function sendWhatsAppMessage(to, text) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: text }
    });

    const options = {
      hostname: 'graph.facebook.com',
      path: '/v18.0/' + PHONE_NUMBER_ID + '/messages',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + WA_TOKEN,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res2) => {
      let data = '';
      res2.on('data', chunk => data += chunk);
      res2.on('end', () => {
        const parsed = JSON.parse(data);
        if (parsed.error) console.error('WhatsApp error:', parsed.error);
        resolve();
      });
    });

    req.on('error', (e) => {
      console.error('WhatsApp request error:', e);
      resolve();
    });

    req.write(body);
    req.end();
  });
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log('🍔 RER WhatsApp Bot running on port ' + PORT));
